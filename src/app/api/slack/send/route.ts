import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Mock answers simulating Slack user responses
const MOCK_ANSWERS: Record<string, string> = {
  'Acceptance Criteria Present':
    '1. User can complete the primary action successfully\n2. Error states are handled gracefully\n3. Performance meets the defined SLA\n4. Accessible via keyboard navigation',
  'Story Points Estimated': '5 story points — moderate complexity with some unknowns.',
  'Assignee Set': 'Assigning to the current sprint team lead.',
  'Technical Design Present':
    'We will use the existing service layer with a new adapter pattern. No new infrastructure needed. Estimated 2 new files + modifications to 3 existing.',
  'Dependencies Identified': 'No hard blockers. Soft dependency on the design system update (can proceed in parallel).',
  'Test Strategy Defined':
    'Unit tests for business logic, integration test for API endpoints, manual QA for UI flows. Targeting 80% coverage.',
  'User Impact Documented':
    'Affects approximately 60% of active users. Will improve task completion rate and reduce support tickets.',
  'Labels Present': 'Adding labels: feature, frontend, sprint-12',
  'Priority Set': 'Setting priority to High based on customer feedback volume.',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId } = body;

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 });
    }

    const issue = await prisma.scannedIssue.findUnique({
      where: { id: issueId },
      include: { answers: true },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
    }

    // Get user mapping for the assignee
    let slackUser = 'Unknown User';
    if (issue.assignee) {
      const mapping = await prisma.userMapping.findUnique({
        where: { jiraEmail: issue.assignee },
      });
      if (mapping) {
        slackUser = mapping.slackDisplayName || mapping.slackUserId;
      }
    }

    if (settings.mockMode) {
      // Set status to WAITING_ON_SLACK
      await prisma.scannedIssue.update({
        where: { id: issueId },
        data: {
          slackMessageSent: true,
          status: 'WAITING_ON_SLACK',
          updatedAt: new Date(),
        },
      });

      // Auto-generate mock answers for unanswered questions after a simulated delay
      const unansweredQuestions = issue.answers.filter(a => !a.answer || a.answer.trim() === '');

      for (const qa of unansweredQuestions) {
        // Extract the missing rule from the question text "[RuleName] Question?"
        const ruleMatch = qa.question.match(/^\[(.+?)\]/);
        const ruleName = ruleMatch ? ruleMatch[1] : '';
        const mockAnswer = MOCK_ANSWERS[ruleName] || 'Acknowledged — will address this before sprint planning.';

        await prisma.qaAnswer.update({
          where: { id: qa.id },
          data: { answer: mockAnswer, answeredAt: new Date() },
        });
      }

      await prisma.auditLog.create({
        data: {
          action: 'SLACK_MESSAGE_SENT',
          entityType: 'ScannedIssue',
          entityId: issueId,
          userId: 'system',
          changes: JSON.stringify({
            mockMode: true,
            slackUser,
            questionsCount: unansweredQuestions.length,
          }),
        },
      });

      return NextResponse.json({
        message: `Mock: Slack message sent to ${slackUser}`,
        slackUser,
        answersGenerated: unansweredQuestions.length,
      });
    }

    // Real mode: send actual Slack message (TODO: implement with Bolt.js)
    return NextResponse.json({ message: 'Slack message sent successfully' });
  } catch (error) {
    console.error('Error sending Slack message:', error);
    return NextResponse.json({ error: 'Failed to send Slack message' }, { status: 500 });
  }
}
