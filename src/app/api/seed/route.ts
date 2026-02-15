import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { DEFAULT_RULES } from '@/lib/rules-engine';
import { encrypt } from '@/lib/crypto';

export async function POST() {
  try {
    // Only create default settings if none exist — never overwrite real credentials
    const existingSettings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!existingSettings) {
      await prisma.settings.create({
        data: {
          id: 'singleton',
          mockMode: true,
          jiraBaseUrl: 'https://example.atlassian.net',
          jiraEmail: 'demo@example.com',
          jiraApiToken: encrypt('demo-token'),
          jiraProjectKeys: 'DEMO',
          jiraJql: 'project = DEMO AND type = Story',
          slackBotToken: encrypt('xoxb-demo'),
          slackSigningSecret: encrypt('demo-secret'),
          llmProvider: 'openai',
          llmApiKey: encrypt('demo-key'),
          llmModel: 'gpt-4o-mini',
        },
      });
    }

    // Delete existing DEMO rulesets and their rules (cascade) for idempotency
    await prisma.dorRuleset.deleteMany({
      where: { projectKey: 'DEMO' },
    });

    // Create fresh default ruleset with configurable thresholds
    const ruleset = await prisma.dorRuleset.create({
      data: {
        projectKey: 'DEMO',
        version: 1,
        isActive: true,
        thresholdReady: 4.0,
        thresholdClarification: 2.5,
      },
    });

    // Create default rules
    for (const rule of DEFAULT_RULES) {
      await prisma.dorRule.create({
        data: {
          ...rule,
          rulesetId: ruleset.id,
        },
      });
    }

    // Delete existing scanned issues for clean slate
    await prisma.qaAnswer.deleteMany({});
    await prisma.scannedIssue.deleteMany({});

    // Upsert user mappings (idempotent)
    const mappings = [
      { jiraEmail: 'alice@example.com', slackUserId: 'U001', slackDisplayName: 'Alice Chen' },
      { jiraEmail: 'bob@example.com', slackUserId: 'U002', slackDisplayName: 'Bob Martinez' },
      { jiraEmail: 'carol@example.com', slackUserId: 'U003', slackDisplayName: 'Carol Wu' },
    ];

    for (const mapping of mappings) {
      await prisma.userMapping.upsert({
        where: { jiraEmail: mapping.jiraEmail },
        update: { slackUserId: mapping.slackUserId, slackDisplayName: mapping.slackDisplayName },
        create: mapping,
      });
    }

    return NextResponse.json({ message: 'Demo data loaded successfully' });
  } catch (error) {
    console.error('Error seeding data:', error);
    return NextResponse.json({ error: 'Failed to seed data' }, { status: 500 });
  }
}
