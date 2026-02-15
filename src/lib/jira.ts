import { decrypt } from './crypto';

/* ── Types ─────────────────────────────────────────────────────── */

export interface JiraSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string; // encrypted in DB
  jiraProjectKeys: string;
  jiraJql: string;
}

export interface NormalizedIssue {
  key: string;
  summary: string;
  description: string;
  assignee: string;
  priority: { name: string } | null;
  labels: string[];
  customfield_10016: number | null;
  [field: string]: unknown;
}

interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraRawIssue[];
}

interface JiraRawIssue {
  key: string;
  fields: Record<string, unknown>;
}

/* ── Client Factory ────────────────────────────────────────────── */

export function createJiraClient(settings: JiraSettings) {
  const baseUrl = settings.jiraBaseUrl.replace(/\/+$/, '');
  const email = settings.jiraEmail;
  const apiToken = decrypt(settings.jiraApiToken);

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  const headers: Record<string, string> = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  /**
   * Search issues using JQL with automatic pagination.
   * Returns all matching issues (up to a sensible limit of 200).
   */
  async function searchIssues(
    jql: string,
    fields: string[] = ['summary', 'description', 'assignee', 'priority', 'labels', 'customfield_10016', 'status'],
    maxTotal = 200,
  ): Promise<NormalizedIssue[]> {
    const allIssues: NormalizedIssue[] = [];
    let startAt = 0;
    const pageSize = 50;

    while (startAt < maxTotal) {
      const params = new URLSearchParams({
        jql,
        fields: fields.join(','),
        startAt: String(startAt),
        maxResults: String(pageSize),
      });
      const response = await fetch(`${baseUrl}/rest/api/3/search/jql?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JIRA search failed (${response.status}): ${errorText}`);
      }

      const data: JiraSearchResponse = await response.json();
      const normalized = data.issues.map(normalizeIssue);
      allIssues.push(...normalized);

      // Check if we have all results
      if (startAt + data.issues.length >= data.total || data.issues.length === 0) {
        break;
      }
      startAt += pageSize;
    }

    return allIssues;
  }

  /**
   * Fetch a single issue by key, returning fresh data from JIRA.
   */
  async function getIssue(
    issueKey: string,
    fields: string[] = ['summary', 'description', 'assignee', 'priority', 'labels', 'customfield_10016', 'status'],
  ): Promise<NormalizedIssue> {
    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueKey}?fields=${fields.join(',')}`,
      { method: 'GET', headers },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`JIRA getIssue failed (${response.status}): ${errorText}`);
    }

    const data: JiraRawIssue = await response.json();
    return normalizeIssue(data);
  }

  /**
   * Add a comment to a JIRA issue.
   * Uses plain text body wrapped in ADF (Atlassian Document Format) paragraph.
   */
  async function addComment(issueKey: string, commentText: string): Promise<void> {
    const adfBody = {
      body: {
        version: 1,
        type: 'doc',
        content: commentText.split('\n').map(line => ({
          type: 'paragraph',
          content: line.trim()
            ? [{ type: 'text', text: line }]
            : [],
        })),
      },
    };

    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers,
      body: JSON.stringify(adfBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`JIRA addComment failed (${response.status}): ${errorText}`);
      // Non-fatal: don't throw, just log
    }
  }

  /**
   * Update labels on a JIRA issue.
   * Adds and/or removes labels in a single PUT request.
   */
  async function updateLabels(
    issueKey: string,
    addLabels: string[],
    removeLabels: string[],
  ): Promise<void> {
    const update: Record<string, unknown> = {};

    if (addLabels.length > 0 || removeLabels.length > 0) {
      const operations: Array<{ add?: string; remove?: string }> = [];
      for (const label of addLabels) {
        operations.push({ add: label });
      }
      for (const label of removeLabels) {
        operations.push({ remove: label });
      }
      update.labels = operations;
    }

    if (Object.keys(update).length === 0) return;

    const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ update }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`JIRA updateLabels failed (${response.status}): ${errorText}`);
      // Non-fatal: don't throw, just log
    }
  }

  return { searchIssues, getIssue, addComment, updateLabels };
}

/* ── Normalizer ────────────────────────────────────────────────── */

/**
 * Transform a raw JIRA API issue into the flat format expected by the rules engine.
 *
 * JIRA returns nested structures:
 *   fields.assignee.emailAddress -> assignee (string)
 *   fields.priority.name -> priority ({ name: string })
 *   fields.labels -> labels (string[])
 *   fields.description (ADF or string) -> description (string)
 *   fields.customfield_10016 -> customfield_10016 (number)
 */
export function normalizeIssue(raw: JiraRawIssue): NormalizedIssue {
  const f = raw.fields;

  // Extract description — may be ADF object or plain string
  let description = '';
  if (typeof f.description === 'string') {
    description = f.description;
  } else if (f.description && typeof f.description === 'object') {
    // ADF format: extract plain text from content nodes
    description = extractTextFromAdf(f.description);
  }

  // Extract assignee email
  let assignee = '';
  if (f.assignee && typeof f.assignee === 'object') {
    const a = f.assignee as Record<string, unknown>;
    assignee = (a.emailAddress as string) || (a.displayName as string) || '';
  }

  // Extract priority
  let priority: { name: string } | null = null;
  if (f.priority && typeof f.priority === 'object') {
    const p = f.priority as Record<string, unknown>;
    if (p.name) priority = { name: p.name as string };
  }

  // Extract labels
  const labels = Array.isArray(f.labels) ? (f.labels as string[]) : [];

  // Extract story points (customfield_10016) — may also be customfield_10028 etc.
  const storyPoints = typeof f.customfield_10016 === 'number'
    ? f.customfield_10016
    : null;

  return {
    key: raw.key,
    summary: (f.summary as string) || '',
    description,
    assignee,
    priority,
    labels,
    customfield_10016: storyPoints,
  };
}

/**
 * Recursively extract plain text from JIRA ADF (Atlassian Document Format).
 */
function extractTextFromAdf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';

  const n = node as Record<string, unknown>;

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return (n.content as unknown[])
      .map(child => extractTextFromAdf(child))
      .join(n.type === 'paragraph' || n.type === 'heading' ? '\n' : '');
  }

  return '';
}

/* ── DoR Summary Comment Builder ───────────────────────────────── */

/**
 * Build a structured DoR summary comment for JIRA writeback.
 */
export function buildDorComment(
  issueKey: string,
  score: number,
  status: string,
  missing: { rule: string; severity: string; suggestion: string }[],
): string {
  const lines = [
    '--- DoR Gatekeeper - Readiness Summary ---',
    `Issue: ${issueKey} | Score: ${score.toFixed(1)}/5.0 | Status: ${status}`,
    '',
  ];

  if (missing.length === 0) {
    lines.push('All Definition of Ready criteria are satisfied.');
  } else {
    lines.push(`Missing Items (${missing.length}):`);
    for (const m of missing) {
      lines.push(`  - [${m.severity.toUpperCase()}] ${m.rule}: ${m.suggestion}`);
    }
  }

  lines.push('');
  lines.push(`Scanned at: ${new Date().toISOString()}`);
  lines.push('--- End DoR Gatekeeper ---');

  return lines.join('\n');
}
