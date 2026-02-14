import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateReadinessScore } from '@/lib/rules-engine';

// Mock Jira issues for demo mode
const MOCK_ISSUES = [
  {
    key: 'DEMO-101',
    summary: 'Implement user authentication system',
    description: 'As a user, I want to log in securely.\n\nAcceptance Criteria:\n- User can log in with email/password\n- Session persists across page refreshes\n- Password reset functionality works\n\nTechnical Design:\n- Use JWT tokens\n- Implement OAuth 2.0\n\nTest Strategy:\n- Unit tests for auth service\n- E2E tests for login flow',
    assignee: 'alice@example.com',
    priority: { name: 'High' },
    labels: ['security', 'backend'],
    customfield_10016: 8, // story points
  },
  {
    key: 'DEMO-102',
    summary: 'Add dark mode toggle',
    description: 'Simple dark mode for the app',
    assignee: '',
    priority: null,
    labels: [],
    customfield_10016: null,
  },
  {
    key: 'DEMO-103',
    summary: 'Optimize database queries',
    description: 'AC: Queries should run under 100ms\n\nDependency: Blocked by infrastructure upgrade',
    assignee: 'bob@example.com',
    priority: { name: 'Medium' },
    labels: ['performance'],
    customfield_10016: 5,
  },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectKey } = body;

    // Get settings to check mock mode
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
    }

    // Get active ruleset
    const ruleset = await prisma.dorRuleset.findFirst({
      where: {
        projectKey: projectKey || settings.jiraProjectKeys,
        isActive: true,
      },
      include: { rules: true },
    });

    if (!ruleset) {
      return NextResponse.json({ error: 'No active ruleset found' }, { status: 404 });
    }

    const issues = settings.mockMode ? MOCK_ISSUES : []; // In real mode, fetch from Jira API

    const scannedIssues = [];

    for (const issue of issues) {
      const readinessScore = calculateReadinessScore(issue, ruleset.rules);
      const status = readinessScore >= 4 ? 'READY' : readinessScore >= 2.5 ? 'NEEDS_CLARIFICATION' : 'NEEDS_INFO';

      const missingItems = ruleset.rules
        .filter(rule => {
          if (!rule.enabled) return false;
          const fieldValue = (issue as any)[rule.targetField] || '';
          let passes = false;

          if (rule.expectedPattern) {
            const regex = new RegExp(rule.expectedPattern, 'i');
            passes = regex.test(String(fieldValue));
          } else {
            passes = fieldValue !== '' && fieldValue !== null;
          }

          if (passes && rule.minLength) {
            passes = String(fieldValue).length >= rule.minLength;
          }

          return !passes;
        })
        .map(rule => rule.name);

      const scannedIssue = await prisma.scannedIssue.upsert({
        where: { jiraKey: issue.key },
        update: {
          summary: issue.summary,
          description: issue.description,
          assignee: issue.assignee || '',
          readinessScore,
          status,
          missingItems: JSON.stringify(missingItems),
          scannedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          jiraKey: issue.key,
          summary: issue.summary,
          description: issue.description,
          assignee: issue.assignee || '',
          readinessScore,
          status,
          missingItems: JSON.stringify(missingItems),
        },
      });

      scannedIssues.push(scannedIssue);
    }

    return NextResponse.json({ message: 'Scan completed', issues: scannedIssues });
  } catch (error) {
    console.error('Error scanning issues:', error);
    return NextResponse.json({ error: 'Failed to scan issues' }, { status: 500 });
  }
}
