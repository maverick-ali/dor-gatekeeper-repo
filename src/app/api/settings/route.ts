import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // Decrypt sensitive fields for display (mask them)
    const decrypted = {
      ...settings,
      jiraApiToken: settings.jiraApiToken ? '****' : '',
      slackBotToken: settings.slackBotToken ? '****' : '',
      slackSigningSecret: settings.slackSigningSecret ? '****' : '',
      slackAppToken: settings.slackAppToken ? '****' : '',
      llmApiKey: settings.llmApiKey ? '****' : '',
    };

    return NextResponse.json(decrypted);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Encrypt sensitive fields if they're being updated
    const updateData: any = { ...body };

    if (body.jiraApiToken && body.jiraApiToken !== '****') {
      updateData.jiraApiToken = encrypt(body.jiraApiToken);
    } else {
      delete updateData.jiraApiToken;
    }

    if (body.slackBotToken && body.slackBotToken !== '****') {
      updateData.slackBotToken = encrypt(body.slackBotToken);
    } else {
      delete updateData.slackBotToken;
    }

    if (body.slackSigningSecret && body.slackSigningSecret !== '****') {
      updateData.slackSigningSecret = encrypt(body.slackSigningSecret);
    } else {
      delete updateData.slackSigningSecret;
    }

    if (body.slackAppToken && body.slackAppToken !== '****') {
      updateData.slackAppToken = encrypt(body.slackAppToken);
    } else {
      delete updateData.slackAppToken;
    }

    if (body.llmApiKey && body.llmApiKey !== '****') {
      updateData.llmApiKey = encrypt(body.llmApiKey);
    } else {
      delete updateData.llmApiKey;
    }

    updateData.updatedAt = new Date();

    const settings = await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: updateData,
      create: { id: 'singleton', ...updateData },
    });

    return NextResponse.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
