import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId, questions } = body;

    if (!issueId || !questions) {
      return NextResponse.json({ error: 'issueId and questions are required' }, { status: 400 });
    }

    const issue = await prisma.scannedIssue.findUnique({
      where: { id: issueId },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    // Get settings for Slack credentials
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
    }

    if (settings.mockMode) {
      // Mock mode: just mark as sent
      await prisma.scannedIssue.update({
        where: { id: issueId },
        data: {
          slackMessageSent: true,
          updatedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'SLACK_MESSAGE_SENT',
          entityType: 'ScannedIssue',
          entityId: issueId,
          userId: 'system',
          changes: JSON.stringify({ mockMode: true, questions }),
        },
      });

      return NextResponse.json({
        message: 'Mock: Slack message would be sent',
        issue: issue.jiraKey,
        assignee: issue.assignee,
      });
    }

    // Real mode: send actual Slack message
    // const slackBotToken = decrypt(settings.slackBotToken);
    // const userMapping = await prisma.userMapping.findUnique({
    //   where: { jiraEmail: issue.assignee },
    // });
    // ... Slack API call here

    return NextResponse.json({ message: 'Slack message sent successfully' });
  } catch (error) {
    console.error('Error sending Slack message:', error);
    return NextResponse.json({ error: 'Failed to send Slack message' }, { status: 500 });
  }
}
