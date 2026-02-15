import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateReadinessScore } from '@/lib/rules-engine';
import { createJiraClient, buildDorComment } from '@/lib/jira';
import type { NormalizedIssue } from '@/lib/jira';

// Mock Jira issues for demo mode — 5 issues with varying completeness
const MOCK_ISSUES: NormalizedIssue[] = [
  {
    key: 'DEMO-101',
    summary: 'Implement user authentication system',
    description:
      'As a user, I want to log in securely.\n\n' +
      'Acceptance Criteria:\n- User can log in with email/password\n- Session persists across page refreshes\n- Password reset functionality works\n\n' +
      'Technical Design:\n- Use JWT tokens stored in httpOnly cookies\n- Implement OAuth 2.0 provider integration\n- Rate-limit login attempts to 5/minute\n\n' +
      'Test Strategy:\n- Unit tests for auth service (token gen, validation)\n- E2E tests for login/logout flow\n- Security pen-test for token leakage\n\n' +
      'User Impact: All users will use this to access the app. Blocking issue for launch.\n\n' +
      'Dependency: Blocked by DEMO-099 (DB schema migration)',
    assignee: 'alice@example.com',
    priority: { name: 'High' },
    labels: ['security', 'backend', 'mvp'],
    customfield_10016: 8,
  },
  {
    key: 'DEMO-102',
    summary: 'Add dark mode toggle',
    description: 'Simple dark mode for the app. Users want it.',
    assignee: '',
    priority: null,
    labels: [],
    customfield_10016: null,
  },
  {
    key: 'DEMO-103',
    summary: 'Optimize database queries for dashboard',
    description:
      'AC: All dashboard queries should run under 100ms at p95.\n\n' +
      'Dependency: Blocked by infrastructure upgrade (DEMO-098).\n\n' +
      'Test Strategy:\n- Benchmark queries before/after\n- Load test with 10k concurrent users',
    assignee: 'bob@example.com',
    priority: { name: 'Medium' },
    labels: ['performance'],
    customfield_10016: 5,
  },
  {
    key: 'DEMO-104',
    summary: 'Create onboarding wizard for new users',
    description:
      'As a new user, I want a guided onboarding flow.\n\n' +
      'Acceptance Criteria:\n- 3-step wizard (profile, preferences, tutorial)\n- Progress saved if user leaves mid-flow\n- Skip option available\n\n' +
      'User Impact: Improves first-time user retention by ~20%.',
    assignee: 'carol@example.com',
    priority: { name: 'High' },
    labels: ['frontend', 'ux'],
    customfield_10016: 5,
  },
  {
    key: 'DEMO-105',
    summary: 'Fix payment processing timeout errors',
    description: 'Payments sometimes time out after 30s. Need investigation.',
    assignee: 'alice@example.com',
    priority: { name: 'Critical' },
    labels: ['bug', 'payments'],
    customfield_10016: 3,
  },
];

// Suggested fixes for each rule name
const SUGGESTED_FIXES: Record<string, string> = {
  'Acceptance Criteria Present': 'Add 3-5 bullet points describing expected behavior under "Acceptance Criteria" heading.',
  'Story Points Estimated': 'Estimate complexity and assign story points (1-13 scale).',
  'Assignee Set': 'Assign a team member who will own this work.',
  'Technical Design Present': 'Add a "Technical Design" section describing the implementation approach.',
  'Dependencies Identified': 'List any blocked-by or depends-on relationships with other issues.',
  'Test Strategy Defined': 'Add a "Test Strategy" section describing how this will be tested.',
  'User Impact Documented': 'Describe how this change affects end users.',
  'Labels Present': 'Add relevant labels (e.g., frontend, backend, bug, feature).',
  'Priority Set': 'Set the priority level (Critical, High, Medium, Low).',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectKey, issueId } = body;

    // Get settings to check mock mode
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not configured. Please load demo data first.' }, { status: 400 });
    }

    // Get active ruleset (with threshold fields for dynamic status computation)
    // Try exact project key first, then fall back to any active ruleset
    let ruleset = await prisma.dorRuleset.findFirst({
      where: {
        projectKey: projectKey || settings.jiraProjectKeys,
        isActive: true,
      },
      include: { rules: true },
    });

    if (!ruleset) {
      // Fallback: use any active ruleset (e.g., DEMO ruleset works for any project)
      ruleset = await prisma.dorRuleset.findFirst({
        where: { isActive: true },
        include: { rules: true },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rulesetAny = ruleset as any;

    if (!ruleset) {
      return NextResponse.json({ error: 'No active ruleset found. Please load demo data first.' }, { status: 404 });
    }

    const tReady = rulesetAny.thresholdReady ?? 4;
    const tClarification = rulesetAny.thresholdClarification ?? 2.5;

    // If issueId is provided, re-scan a single issue
    if (issueId) {
      const existingIssue = await prisma.scannedIssue.findUnique({
        where: { id: issueId },
        include: { answers: true },
      });
      if (!existingIssue) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }

      // Get fresh issue data
      let issueData: NormalizedIssue;
      if (settings.mockMode) {
        const mockIssue = MOCK_ISSUES.find(m => m.key === existingIssue.jiraKey);
        if (!mockIssue) {
          return NextResponse.json({ error: 'Mock issue not found' }, { status: 404 });
        }
        issueData = mockIssue;
      } else {
        // Real mode: fetch fresh data from JIRA
        try {
          const jiraClient = createJiraClient(settings);
          issueData = await jiraClient.getIssue(existingIssue.jiraKey);
        } catch (jiraError) {
          console.error('JIRA fetch failed during re-scan:', jiraError);
          // Fall back to stored data
          issueData = {
            key: existingIssue.jiraKey,
            summary: existingIssue.summary,
            description: existingIssue.description,
            assignee: existingIssue.assignee,
            priority: null,
            labels: [],
            customfield_10016: null,
          };
        }
      }

      // Compute missing items, but treat answered questions as satisfied
      const answeredRules = existingIssue.answers
        .filter(a => a.answer && a.answer.trim() !== '')
        .map(a => a.question);

      const { score, missing } = scoreIssue(issueData, ruleset.rules, answeredRules);
      const status = existingIssue.manualOverride
        ? existingIssue.status
        : score >= tReady ? 'READY' : score >= tClarification ? 'NEEDS_CLARIFICATION' : 'NEEDS_INFO';

      const updated = await prisma.scannedIssue.update({
        where: { id: issueId },
        data: {
          readinessScore: score,
          status,
          missingItems: JSON.stringify(missing),
          scannedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // JIRA writeback on re-scan (non-mock only)
      if (!settings.mockMode) {
        try {
          const jiraClient = createJiraClient(settings);
          // Update labels
          if (status === 'READY') {
            await jiraClient.updateLabels(existingIssue.jiraKey, ['DOR_READY'], ['DOR_NEEDS_INFO']);
          } else {
            await jiraClient.updateLabels(existingIssue.jiraKey, ['DOR_NEEDS_INFO'], ['DOR_READY']);
          }
        } catch (writebackError) {
          console.error('JIRA writeback failed on re-scan:', writebackError);
        }
      }

      return NextResponse.json({ message: 'Re-scan completed', issue: updated });
    }

    // ── Full scan of all issues ──────────────────────────────────
    let issues: NormalizedIssue[];

    if (settings.mockMode) {
      issues = MOCK_ISSUES;
    } else {
      // Real mode: fetch issues from JIRA
      const jiraClient = createJiraClient(settings);
      const jql = settings.jiraJql
        || `project = ${projectKey || settings.jiraProjectKeys} AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
      issues = await jiraClient.searchIssues(jql);
    }

    const scannedIssues = [];

    for (const issue of issues) {
      const { score, missing } = scoreIssue(issue, ruleset.rules, []);
      const status = score >= tReady ? 'READY' : score >= tClarification ? 'NEEDS_CLARIFICATION' : 'NEEDS_INFO';

      const scannedIssue = await prisma.scannedIssue.upsert({
        where: { jiraKey: issue.key },
        update: {
          summary: issue.summary,
          description: issue.description,
          assignee: issue.assignee || '',
          readinessScore: score,
          status,
          missingItems: JSON.stringify(missing),
          scannedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          jiraKey: issue.key,
          summary: issue.summary,
          description: issue.description,
          assignee: issue.assignee || '',
          readinessScore: score,
          status,
          missingItems: JSON.stringify(missing),
        },
      });

      scannedIssues.push(scannedIssue);

      // JIRA writeback: labels + comment (non-mock only)
      if (!settings.mockMode) {
        try {
          const jiraClient = createJiraClient(settings);

          // Update labels based on status
          if (status === 'READY') {
            await jiraClient.updateLabels(issue.key, ['DOR_READY'], ['DOR_NEEDS_INFO']);
          } else {
            await jiraClient.updateLabels(issue.key, ['DOR_NEEDS_INFO'], ['DOR_READY']);
          }

          // Add DoR summary comment
          const comment = buildDorComment(issue.key, score, status, missing);
          await jiraClient.addComment(issue.key, comment);
        } catch (writebackError) {
          console.error(`JIRA writeback failed for ${issue.key}:`, writebackError);
          // Non-fatal: continue processing other issues
        }
      }
    }

    return NextResponse.json({ message: `Scan completed — ${scannedIssues.length} issues processed`, issues: scannedIssues });
  } catch (error) {
    console.error('Error scanning issues:', error);
    return NextResponse.json({ error: 'Failed to scan issues' }, { status: 500 });
  }
}

/** Score an issue against rules, returning score and structured missing items */
function scoreIssue(
  issue: NormalizedIssue,
  rules: any[],
  answeredQuestions: string[]
): { score: number; missing: { rule: string; severity: string; suggestion: string }[] } {
  const readinessScore = calculateReadinessScore(issue, rules);

  const missing = rules
    .filter(rule => {
      if (!rule.enabled) return false;

      // Check if this rule was addressed via Q&A answers
      const ruleAnswered = answeredQuestions.some(q =>
        q.toLowerCase().includes(rule.name.toLowerCase())
      );
      if (ruleAnswered) return false;

      const fieldValue = (issue as any)[rule.targetField] || '';
      let passes = false;

      if (rule.expectedPattern) {
        // Strip Python-style (?i) inline flag; the 'i' flag is already passed to RegExp
        const cleanPattern = rule.expectedPattern.replace(/\(\?i\)/g, '');
        const regex = new RegExp(cleanPattern, 'i');
        passes = regex.test(String(fieldValue));
      } else {
        passes = fieldValue !== '' && fieldValue !== null;
      }

      if (passes && rule.minLength) {
        passes = String(fieldValue).length >= rule.minLength;
      }

      return !passes;
    })
    .map(rule => ({
      rule: rule.name,
      severity: rule.severity,
      suggestion: SUGGESTED_FIXES[rule.name] || 'Address this requirement.',
    }));

  // Boost score based on answered questions ratio
  let boostedScore = readinessScore;
  if (answeredQuestions.length > 0) {
    const totalMissingBeforeAnswers = rules.filter(r => r.enabled).length;
    const answeredRatio = answeredQuestions.length / Math.max(totalMissingBeforeAnswers, 1);
    boostedScore = Math.min(5, readinessScore + answeredRatio * (5 - readinessScore) * 0.6);
  }

  return { score: boostedScore, missing };
}
