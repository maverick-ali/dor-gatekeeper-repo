import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import {
  createSlackClient,
  sendQuestionMessage,
  lookupUserByEmail,
} from '@/lib/slack';

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
    let slackUserId = '';
    if (issue.assignee) {
      const mapping = await prisma.userMapping.findUnique({
        where: { jiraEmail: issue.assignee },
      });
      if (mapping) {
        slackUser = mapping.slackDisplayName || mapping.slackUserId;
        slackUserId = mapping.slackUserId;
      }
    }

    if (settings.mockMode) {
      // ── Mock Mode ──────────────────────────────────────────────
      await prisma.scannedIssue.update({
        where: { id: issueId },
        data: {
          slackMessageSent: true,
          status: 'WAITING_ON_SLACK',
          updatedAt: new Date(),
        },
      });

      // Auto-generate mock answers for unanswered questions
      const unansweredQuestions = issue.answers.filter(a => !a.answer || a.answer.trim() === '');

      for (const qa of unansweredQuestions) {
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

    // ── Real Mode: Send actual Slack message ──────────────────────

    if (!settings.slackBotToken) {
      return NextResponse.json({ error: 'Slack bot token not configured' }, { status: 400 });
    }

    const client = createSlackClient(settings.slackBotToken);

    // Determine the target channel:
    // 1. Try DM to the mapped Slack user
    // 2. If no mapping, try Slack user lookup by email
    // 3. Fall back to default channel
    let targetChannel = settings.slackDefaultChannel || '';

    if (slackUserId) {
      targetChannel = slackUserId; // DM to user by Slack user ID
    } else if (issue.assignee) {
      // Try auto-lookup by email
      const lookedUpId = await lookupUserByEmail(client, issue.assignee);
      if (lookedUpId) {
        targetChannel = lookedUpId;
        slackUserId = lookedUpId;
        // Optionally save the mapping for future use
        await prisma.userMapping.upsert({
          where: { jiraEmail: issue.assignee },
          update: { slackUserId: lookedUpId },
          create: {
            jiraEmail: issue.assignee,
            slackUserId: lookedUpId,
            slackDisplayName: issue.assignee,
          },
        });
      }
    }

    if (!targetChannel) {
      return NextResponse.json({
        error: 'No Slack channel or user found. Configure a default channel or user mapping.',
      }, { status: 400 });
    }

    // Get unanswered questions to include in the message
    const unansweredQuestions = issue.answers
      .filter(a => !a.answer || a.answer.trim() === '')
      .map(q => ({ id: q.id, question: q.question }));

    if (unansweredQuestions.length === 0) {
      return NextResponse.json({
        message: 'No unanswered questions to send.',
      });
    }

    // Send Block Kit message
    await sendQuestionMessage(
      client,
      targetChannel,
      {
        jiraKey: issue.jiraKey,
        summary: issue.summary,
        readinessScore: issue.readinessScore,
        status: issue.status,
        id: issue.id,
      },
      unansweredQuestions,
      settings.jiraBaseUrl,
    );

    // Update issue status
    await prisma.scannedIssue.update({
      where: { id: issueId },
      data: {
        slackMessageSent: true,
        status: 'WAITING_ON_SLACK',
        updatedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'SLACK_MESSAGE_SENT',
        entityType: 'ScannedIssue',
        entityId: issueId,
        userId: 'system',
        changes: JSON.stringify({
          mockMode: false,
          slackUser: slackUserId || targetChannel,
          questionsCount: unansweredQuestions.length,
        }),
      },
    });

    return NextResponse.json({
      message: `Slack message sent to ${slackUser || targetChannel}`,
      slackUser: slackUserId || targetChannel,
      questionsCount: unansweredQuestions.length,
    });
  } catch (error) {
    console.error('Error sending Slack message:', error);
    return NextResponse.json({ error: 'Failed to send Slack message' }, { status: 500 });
  }
}
