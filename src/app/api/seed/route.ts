import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { DEFAULT_RULES } from '@/lib/rules-engine';
import { encrypt } from '@/lib/crypto';

export async function POST() {
  try {
    // Create settings with mock mode enabled
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: {
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
        llmModel: 'gpt-4',
      },
      create: {
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
        llmModel: 'gpt-4',
      },
    });

    // Create default ruleset
    const ruleset = await prisma.dorRuleset.create({
      data: {
        projectKey: 'DEMO',
        version: 1,
        isActive: true,
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

    // Create user mappings
    await prisma.userMapping.createMany({
      data: [
        { jiraEmail: 'alice@example.com', slackUserId: 'U001', slackDisplayName: 'alice' },
        { jiraEmail: 'bob@example.com', slackUserId: 'U002', slackDisplayName: 'bob' },
      ],
    });

    return NextResponse.json({ message: 'Demo data loaded successfully' });
  } catch (error) {
    console.error('Error seeding data:', error);
    return NextResponse.json({ error: 'Failed to seed data' }, { status: 500 });
  }
}
