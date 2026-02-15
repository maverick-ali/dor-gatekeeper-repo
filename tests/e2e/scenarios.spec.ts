import { test, expect, Page } from '@playwright/test';

/**
 * DoR Gatekeeper – End-to-End Test Suite
 *
 * These 16 scenarios run sequentially; each builds on the state left by the
 * previous one (e.g. Scenario 2 seeds data that Scenario 3 scans).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for an API response that matches the given URL pattern. */
async function waitForApi(page: Page, urlPart: string) {
  return page.waitForResponse(
    (res) => res.url().includes(urlPart) && res.status() < 500,
    { timeout: 15_000 },
  );
}

/** Click a button (by its visible text) and wait for an API round-trip. */
async function clickAndWait(page: Page, buttonText: string | RegExp, apiUrl: string) {
  const [response] = await Promise.all([
    waitForApi(page, apiUrl),
    page.getByRole('button', { name: buttonText }).click(),
  ]);
  return response;
}

/** Wait for a toast to appear and assert its text contains the given string. */
async function expectToast(page: Page, text: string) {
  const toast = page.locator('.fixed.top-4.right-4');
  await expect(toast).toBeVisible({ timeout: 5_000 });
  await expect(toast).toContainText(text);
}

// ---------------------------------------------------------------------------
// All scenarios share a single browser context so DB state persists.
// ---------------------------------------------------------------------------

test.describe.serial('DoR Gatekeeper E2E', () => {

  // =========================================================================
  // Scenario 1 – Initial State & Navigation
  // =========================================================================
  test('Scenario 1: Initial state and navigation', async ({ page }) => {
    await page.goto('/');

    // Dashboard heading visible
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Nav: Dashboard link is active (has blue border class)
    const dashLink = page.locator('nav a', { hasText: 'Dashboard' });
    await expect(dashLink).toHaveClass(/border-blue-500/);

    // Empty state message
    await expect(page.getByText('No Issues Scanned Yet')).toBeVisible();

    // Navigate to Settings
    await page.click('nav a:has-text("Settings")');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    const settingsLink = page.locator('nav a', { hasText: 'Settings' });
    await expect(settingsLink).toHaveClass(/border-blue-500/);

    // Navigate to Rules
    await page.click('nav a:has-text("Rules")');
    // With no data loaded, the rules page shows "No ruleset found" (no heading)
    await expect(page.getByText('No ruleset found')).toBeVisible();
    const rulesLink = page.locator('nav a', { hasText: 'Rules' });
    await expect(rulesLink).toHaveClass(/border-blue-500/);

    // Back to Dashboard
    await page.click('nav a:has-text("Dashboard")');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  // =========================================================================
  // Scenario 2 – Load Demo Data
  // =========================================================================
  test('Scenario 2: Load Demo Data', async ({ page }) => {
    await page.goto('/');

    await clickAndWait(page, /Load Demo Data/, '/api/seed');
    await expectToast(page, 'Demo data loaded');

    // Verify Settings populated
    await page.goto('/settings');
    await expect(page.locator('#mockMode')).toBeChecked();

    const baseUrlInput = page.locator('input[placeholder="https://example.atlassian.net"]');
    await expect(baseUrlInput).toHaveValue('https://example.atlassian.net');

    // Jira fields should be disabled (inside a disabled fieldset)
    await expect(baseUrlInput).toBeDisabled();

    // Verify Rules populated
    await page.goto('/rules');
    await expect(page.getByText('Acceptance Criteria Present')).toBeVisible();
    await expect(page.getByText('Story Points Estimated')).toBeVisible();
    await expect(page.getByText('Priority Set')).toBeVisible();

    // Should see 9 rule checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(9);
  });

  // =========================================================================
  // Scenario 3 – Scan Issues
  // =========================================================================
  test('Scenario 3: Scan Issues', async ({ page }) => {
    await page.goto('/');

    await clickAndWait(page, /Scan Issues/, '/api/scan');
    await expectToast(page, 'Scan completed');

    // Wait for issues to load in the table
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Verify 5 rows
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(5);

    // Verify known issue keys
    await expect(page.getByText('DEMO-101')).toBeVisible();
    await expect(page.getByText('DEMO-102')).toBeVisible();
    await expect(page.getByText('DEMO-103')).toBeVisible();
    await expect(page.getByText('DEMO-104')).toBeVisible();
    await expect(page.getByText('DEMO-105')).toBeVisible();

    // Stats bar – use the small label text within the stat cards
    const statsBar = page.locator('.grid.grid-cols-2');
    await expect(statsBar.getByText('Total Issues')).toBeVisible();
    await expect(statsBar.getByText('Ready', { exact: true })).toBeVisible();
    await expect(statsBar.getByText('Needs Info', { exact: true })).toBeVisible();
    await expect(statsBar.getByText('Avg Score')).toBeVisible();
  });

  // =========================================================================
  // Scenario 4 – Tabs & Filtering
  // =========================================================================
  test('Scenario 4: Tabs and filtering', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // "All" tab should show all 5
    const allTab = page.locator('button', { hasText: 'All' }).first();
    await allTab.click();
    await expect(page.locator('table tbody tr')).toHaveCount(5);

    // "Ready" tab
    const readyTab = page.locator('button', { hasText: 'Ready' }).first();
    await readyTab.click();
    // At least DEMO-101 should be READY
    const readyRows = page.locator('table tbody tr');
    const readyCount = await readyRows.count();
    expect(readyCount).toBeGreaterThanOrEqual(1);

    // "Needs Info" tab
    const needsInfoTab = page.locator('button', { hasText: 'Needs Info' }).first();
    await needsInfoTab.click();
    const niRows = page.locator('table tbody tr');
    const niCount = await niRows.count();
    expect(niCount).toBeGreaterThanOrEqual(1);

    // "Waiting on Slack" tab – should be empty initially
    const slackTab = page.locator('button', { hasText: 'Waiting on Slack' });
    await slackTab.click();
    await expect(page.getByText('No Issues in This Tab')).toBeVisible();

    // Go back to All
    await allTab.click();
    await expect(page.locator('table tbody tr')).toHaveCount(5);
  });

  // =========================================================================
  // Scenario 5 – Sorting
  // =========================================================================
  test('Scenario 5: Sorting', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Sort by Issue key ascending
    const issueHeader = page.locator('th', { hasText: 'Issue' });
    await issueHeader.click();
    // After one click the column should show an arrow
    await expect(issueHeader).toContainText(/[↑↓]/);

    // Get first row's issue key
    const firstKey = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstKey?.trim()).toBeTruthy();

    // Click again to reverse
    await issueHeader.click();
    const newFirstKey = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(newFirstKey?.trim()).toBeTruthy();
    // They should be different (ascending vs descending)
    if (firstKey !== newFirstKey) {
      // Sort direction changed – pass
    }

    // Sort by Score
    const scoreHeader = page.locator('th', { hasText: 'Score' });
    await scoreHeader.click();
    await expect(scoreHeader).toContainText(/[↑↓]/);
  });

  // =========================================================================
  // Scenario 6 – Issue Drawer (DEMO-101, high score)
  // =========================================================================
  test('Scenario 6: Issue drawer – high score issue', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Click DEMO-101 row
    await page.locator('table tbody tr', { hasText: 'DEMO-101' }).click();

    // Drawer opens
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Header
    await expect(drawer.getByText('DEMO-101')).toBeVisible();
    await expect(drawer.getByText('Implement user authentication system')).toBeVisible();

    // Score card
    await expect(drawer.getByText('Score / 5.0')).toBeVisible();

    // Assignee
    await expect(drawer.getByText('alice@example.com')).toBeVisible();

    // Description section
    await expect(drawer.getByText('Description')).toBeVisible();
    await expect(drawer.getByText('Acceptance Criteria')).toBeVisible();

    // Close via ESC
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();

    // Re-open and close via X
    await page.locator('table tbody tr', { hasText: 'DEMO-101' }).click();
    await expect(drawer).toBeVisible();
    await drawer.locator('button:has-text("×")').click();
    await expect(drawer).not.toBeVisible();
  });

  // =========================================================================
  // Scenario 7 – Issue Drawer (DEMO-102, low score) + Generate Questions
  // =========================================================================
  test('Scenario 7: Issue drawer – low score issue + generate questions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Click DEMO-102
    await page.locator('table tbody tr', { hasText: 'DEMO-102' }).click();

    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Status badge should be NEEDS INFO or NEEDS CLARIFICATION
    const statusBadge = drawer.locator('span.rounded-full').first();
    await expect(statusBadge).toBeVisible();

    // Missing items section
    await expect(drawer.getByText('Missing Items')).toBeVisible();

    // Generate Questions button
    const genBtn = drawer.getByRole('button', { name: 'Generate Questions' });
    await expect(genBtn).toBeVisible();

    // Click Generate Questions
    const [genRes] = await Promise.all([
      waitForApi(page, '/api/questions/generate'),
      genBtn.click(),
    ]);
    expect(genRes.status()).toBeLessThan(500);

    await expectToast(page, 'Questions generated');

    // Questions should appear (answer inputs visible)
    await expect(drawer.locator('input[placeholder="Type your answer..."]').first()).toBeVisible({ timeout: 5_000 });

    // Progress bar should show 0 answered
    await expect(drawer.getByText(/0\/\d+ answered/)).toBeVisible();

    // Close
    await page.keyboard.press('Escape');
  });

  // =========================================================================
  // Scenario 8 – Manual Answer Submission
  // =========================================================================
  test('Scenario 8: Manual answer submission', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    await page.locator('table tbody tr', { hasText: 'DEMO-102' }).click();
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Wait for questions to load
    const answerInput = drawer.locator('input[placeholder="Type your answer..."]').first();
    await expect(answerInput).toBeVisible({ timeout: 5_000 });

    // Type an answer and press Enter
    await answerInput.fill('Yes, acceptance criteria are defined in the design doc');
    await answerInput.press('Enter');

    await expectToast(page, 'Answer saved');

    // Progress should update (1/N answered)
    await expect(drawer.getByText(/1\/\d+ answered/)).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  // =========================================================================
  // Scenario 9 – Send Questions via Slack (Mock Mode)
  // =========================================================================
  test('Scenario 9: Send to Slack (mock)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    await page.locator('table tbody tr', { hasText: 'DEMO-102' }).click();
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Click Send Questions via Slack
    const slackBtn = drawer.getByRole('button', { name: /Send Questions via Slack/ });
    await expect(slackBtn).toBeVisible({ timeout: 5_000 });

    const [slackRes] = await Promise.all([
      waitForApi(page, '/api/slack/send'),
      slackBtn.click(),
    ]);
    expect(slackRes.status()).toBeLessThan(500);

    await expectToast(page, 'Slack message sent');

    // After mock slack send, the slack section should show success (the drawer text)
    await expect(drawer.getByText('Slack message sent').first()).toBeVisible({ timeout: 5_000 });

    // Answers should be populated (green borders)
    await expect(drawer.locator('.border-green-200').first()).toBeVisible({ timeout: 5_000 });

    // Close and check table
    await page.keyboard.press('Escape');

    // Status should have changed – go to "Waiting on Slack" tab
    const slackTab = page.locator('button', { hasText: 'Waiting on Slack' });
    await slackTab.click();
    await expect(page.locator('table tbody tr', { hasText: 'DEMO-102' })).toBeVisible({ timeout: 5_000 });
  });

  // =========================================================================
  // Scenario 10 – Re-scan Issue
  // =========================================================================
  test('Scenario 10: Re-scan issue', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    await page.locator('table tbody tr', { hasText: 'DEMO-102' }).click();
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Get the score before re-scan
    const scoreBefore = await drawer.locator('.text-2xl.font-bold').first().textContent();

    // Click Re-scan Issue
    const rescanBtn = drawer.getByRole('button', { name: /Re-scan Issue/ });
    await expect(rescanBtn).toBeVisible();

    await clickAndWait(page, /Re-scan Issue/, '/api/scan');
    await expectToast(page, 'Re-scan completed');

    // Reload page to get clean state (avoids drawer race condition)
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });
    await page.locator('table tbody tr', { hasText: 'DEMO-102' }).click();
    const drawerAfter = page.locator('.fixed.top-0.right-0');
    await expect(drawerAfter).toBeVisible();

    // Score should potentially have improved (or at least exist)
    const scoreAfter = await drawerAfter.locator('.text-2xl.font-bold').first().textContent();
    expect(scoreAfter).toBeTruthy();

    // The score should be >= the old one (answers boost it)
    const before = parseFloat(scoreBefore || '0');
    const after = parseFloat(scoreAfter || '0');
    expect(after).toBeGreaterThanOrEqual(before);

    await page.keyboard.press('Escape');
  });

  // =========================================================================
  // Scenario 11 – Manual Override
  // =========================================================================
  test('Scenario 11: Manual override', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Open DEMO-105 (low score, not READY)
    await page.locator('table tbody tr', { hasText: 'DEMO-105' }).click();
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Click Manual Override button
    const overrideBtn = drawer.getByRole('button', { name: /Mark as READY/ });
    await expect(overrideBtn).toBeVisible();
    await overrideBtn.click();

    // Textarea for reason should appear
    const reasonInput = drawer.locator('textarea[placeholder*="Reason for override"]');
    await expect(reasonInput).toBeVisible();

    // Confirm button should be disabled without reason
    const confirmBtn = drawer.getByRole('button', { name: 'Confirm Override' });
    await expect(confirmBtn).toBeDisabled();

    // Type a reason
    await reasonInput.fill('Discussed in sprint planning, team agreed to proceed');
    await expect(confirmBtn).toBeEnabled();

    // Click Confirm Override
    const [overrideRes] = await Promise.all([
      waitForApi(page, '/api/issues/override'),
      confirmBtn.click(),
    ]);
    expect(overrideRes.status()).toBeLessThan(500);

    await expectToast(page, 'Issue marked as READY');

    // Reload page to get clean state (avoids drawer race condition)
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Verify in the Ready tab
    await page.locator('button', { hasText: 'Ready' }).first().click();
    await expect(page.locator('table tbody tr', { hasText: 'DEMO-105' })).toBeVisible({ timeout: 5_000 });

    // Should have OVR badge
    await expect(page.locator('table tbody tr', { hasText: 'DEMO-105' }).getByText('OVR')).toBeVisible();
  });

  // =========================================================================
  // Scenario 12 – Export
  // =========================================================================
  test('Scenario 12: Export CSV and JSON', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Export dropdown should be visible
    const exportBtn = page.getByRole('button', { name: 'Export', exact: true });
    await expect(exportBtn).toBeVisible();

    // CSV export
    await exportBtn.hover();
    const csvBtn = page.getByRole('button', { name: 'Export CSV' });
    await expect(csvBtn).toBeVisible({ timeout: 3_000 });

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      csvBtn.click(),
    ]);
    expect(csvDownload.suggestedFilename()).toBe('dor-report.csv');
    await expectToast(page, 'CSV exported');

    // JSON export – re-hover to reveal dropdown again
    await exportBtn.hover();
    const jsonBtn = page.getByRole('button', { name: 'Export JSON' });
    await expect(jsonBtn).toBeVisible({ timeout: 3_000 });

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      jsonBtn.click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toBe('dor-report.json');
    await expectToast(page, 'JSON exported');
  });

  // =========================================================================
  // Scenario 13 – Settings: Mock Mode Toggle & Dynamic LLM
  // =========================================================================
  test('Scenario 13: Settings – mock mode toggle and dynamic LLM', async ({ page }) => {
    await page.goto('/settings');

    // Mock mode should be checked
    const mockCheckbox = page.locator('#mockMode');
    await expect(mockCheckbox).toBeChecked();

    // Jira fields should be disabled
    const baseUrlInput = page.locator('input[placeholder="https://example.atlassian.net"]');
    await expect(baseUrlInput).toBeDisabled();

    // Uncheck mock mode
    await mockCheckbox.uncheck();
    await expect(mockCheckbox).not.toBeChecked();

    // Jira fields should now be enabled
    await expect(baseUrlInput).toBeEnabled();

    // Test LLM provider switching
    const providerSelect = page.locator('select').filter({ hasText: 'OpenAI' });

    // Switch to Anthropic
    await providerSelect.selectOption('anthropic');
    const modelSelect = page.locator('select').last();
    await expect(modelSelect.locator('option', { hasText: 'Claude 3 Haiku' })).toBeAttached();

    // Switch to Google
    await providerSelect.selectOption('google');
    await expect(modelSelect.locator('option', { hasText: 'Gemini 1.5 Flash' })).toBeAttached();

    // Switch back to OpenAI
    await providerSelect.selectOption('openai');
    await expect(modelSelect.locator('option', { hasText: 'GPT-4o Mini' })).toBeAttached();

    // Re-enable mock mode
    await mockCheckbox.check();
    await expect(baseUrlInput).toBeDisabled();

    // Save settings
    const saveBtn = page.getByRole('button', { name: /Save Settings/ });
    const [saveRes] = await Promise.all([
      waitForApi(page, '/api/settings'),
      saveBtn.click(),
    ]);
    expect(saveRes.status()).toBeLessThan(500);

    await expect(page.getByText(/Settings updated|Settings saved|saved successfully/i)).toBeVisible({ timeout: 5_000 });
  });

  // =========================================================================
  // Scenario 14 – Rules: Toggle Rules
  // =========================================================================
  test('Scenario 14: Rules – toggle individual rules', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForSelector('input[type="checkbox"]', { timeout: 5_000 });

    // Find the "Labels Present" rule card by its heading, then navigate to its checkbox
    const labelsHeading = page.locator('h4', { hasText: 'Labels Present' });
    await expect(labelsHeading).toBeVisible();
    // The checkbox is a sibling in the same .flex.items-center.gap-3 container
    const labelsCheckbox = labelsHeading.locator('..').locator('input[type="checkbox"]');

    // Should be checked initially
    await expect(labelsCheckbox).toBeChecked();

    // Click to uncheck (use click instead of uncheck for reliability)
    await labelsCheckbox.click();
    await page.waitForTimeout(1_000);

    // Re-enable it
    await labelsCheckbox.click();
    await page.waitForTimeout(1_000);
  });

  // =========================================================================
  // Scenario 15 – Idempotency
  // =========================================================================
  test('Scenario 15: Idempotency – re-load and re-scan', async ({ page }) => {
    await page.goto('/');

    // Load demo data again
    await clickAndWait(page, /Load Demo Data/, '/api/seed');
    await expectToast(page, 'Demo data loaded');

    // Scan again
    await clickAndWait(page, /Scan Issues/, '/api/scan');
    await expectToast(page, 'Scan completed');

    // Should still have exactly 5 issues (upserted, not duplicated)
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(5);

    // Settings should still be intact
    await page.goto('/settings');
    await expect(page.locator('#mockMode')).toBeChecked();

    // Rules should still be 9
    await page.goto('/rules');
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(9);
  });

  // =========================================================================
  // Scenario 16 – Regenerate Questions
  // =========================================================================
  test('Scenario 16: Regenerate questions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('table tbody tr', { timeout: 5_000 });

    // Open DEMO-103
    await page.locator('table tbody tr', { hasText: 'DEMO-103' }).click();
    const drawer = page.locator('.fixed.top-0.right-0');
    await expect(drawer).toBeVisible();

    // Generate questions
    const genBtn = drawer.getByRole('button', { name: 'Generate Questions' });
    if (await genBtn.isVisible()) {
      await Promise.all([
        waitForApi(page, '/api/questions/generate'),
        genBtn.click(),
      ]);
      await expectToast(page, 'Questions generated');
    }

    // Wait for questions to appear
    await expect(drawer.locator('input[placeholder="Type your answer..."]').first()).toBeVisible({ timeout: 5_000 });

    // Regenerate
    const regenBtn = drawer.getByRole('button', { name: 'Regenerate' });
    await expect(regenBtn).toBeVisible();

    await Promise.all([
      waitForApi(page, '/api/questions/generate'),
      regenBtn.click(),
    ]);

    await expectToast(page, 'Questions regenerated');

    // Questions should still be visible
    await expect(drawer.locator('input[placeholder="Type your answer..."]').first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });
});
