import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import {
  createSlackClient,
  verifySlackSignature,
  openAnswerModal,
  buildQaComment,
} from '@/lib/slack';
import { createJiraClient } from '@/lib/jira';

export async function POST(request: Request) {
  try {
    // Slack sends interactivity payloads as application/x-www-form-urlencoded
    const rawBody = await request.text();

    // Get settings for signature verification
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
    }

    // ── Signature Verification ─────────────────────────────────
    if (!settings.mockMode && settings.slackSigningSecret) {
      const timestamp = request.headers.get('x-slack-request-timestamp') || '';
      const signature = request.headers.get('x-slack-signature') || '';

      if (timestamp && signature) {
        const valid = verifySlackSignature(
          settings.slackSigningSecret,
          timestamp,
          rawBody,
          signature,
        );

        if (!valid) {
          console.error('Slack signature verification failed');
          return new NextResponse('Invalid signature', { status: 401 });
        }
      }
    }

    // ── Parse Payload ──────────────────────────────────────────
    // Slack sends: payload=URL_ENCODED_JSON
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      // Might be a direct JSON request (e.g., from mock/testing)
      try {
        const jsonBody = JSON.parse(rawBody);
        const payload = typeof jsonBody.payload === 'string'
          ? JSON.parse(jsonBody.payload)
          : jsonBody.payload || jsonBody;
        return await handleInteraction(payload, settings);
      } catch {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
      }
    }

    const interaction = JSON.parse(payloadStr);
    return await handleInteraction(interaction, settings);
  } catch (error) {
    console.error('Error handling Slack interaction:', error);
    return NextResponse.json({ error: 'Failed to handle interaction' }, { status: 500 });
  }
}

async function handleInteraction(
  interaction: any,
  settings: any,
): Promise<NextResponse> {
  // ── Block Actions (button clicks) ────────────────────────────
  if (interaction.type === 'block_actions') {
    const action = interaction.actions?.[0];

    if (action?.action_id === 'answer_questions') {
      // User clicked "Answer Questions" button
      const valueData = JSON.parse(action.value || '{}');
      const { issueId, issueKey } = valueData;
      const triggerId = interaction.trigger_id;

      if (!issueId || !triggerId) {
        return NextResponse.json({ error: 'Missing issueId or trigger_id' }, { status: 400 });
      }

      // Fetch issue and unanswered questions
      const issue = await prisma.scannedIssue.findUnique({
        where: { id: issueId },
        include: { answers: true },
      });

      if (!issue) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
      }

      const unansweredQuestions = issue.answers
        .filter(a => !a.answer || a.answer.trim() === '')
        .map(q => ({ id: q.id, question: q.question }));

      if (unansweredQuestions.length === 0) {
        // All questions already answered — acknowledge
        return NextResponse.json({
          response_type: 'ephemeral',
          text: 'All questions for this issue have already been answered.',
        });
      }

      // Open the answer modal
      if (!settings.mockMode && settings.slackBotToken) {
        const client = createSlackClient(settings.slackBotToken);
        await openAnswerModal(
          client,
          triggerId,
          { id: issue.id, jiraKey: issue.jiraKey, summary: issue.summary },
          unansweredQuestions,
        );
      }

      // Slack requires a 200 response to acknowledge the action
      return new NextResponse('', { status: 200 });
    }

    // Unknown action — acknowledge
    return new NextResponse('', { status: 200 });
  }

  // ── View Submission (modal form) ─────────────────────────────
  if (interaction.type === 'view_submission') {
    const callbackId = interaction.view?.callback_id;

    if (callbackId === 'dor_answer_modal') {
      const metadata = JSON.parse(interaction.view?.private_metadata || '{}');
      const { issueId, issueKey, questionIds } = metadata;
      const values = interaction.view?.state?.values || {};

      // Extract answers from the modal submission
      const answersToSave: { qaId: string; question: string; answer: string }[] = [];

      for (const qId of questionIds || []) {
        const blockValues = values[`answer_${qId}`];
        if (!blockValues) continue;

        const inputValue = blockValues[`answer_input_${qId}`]?.value;
        if (inputValue && inputValue.trim()) {
          // Fetch the question text
          const qa = await prisma.qaAnswer.findUnique({ where: { id: qId } });
          if (qa) {
            answersToSave.push({
              qaId: qId,
              question: qa.question,
              answer: inputValue.trim(),
            });
          }
        }
      }

      // Save answers to DB
      for (const a of answersToSave) {
        await prisma.qaAnswer.update({
          where: { id: a.qaId },
          data: { answer: a.answer, answeredAt: new Date() },
        });
      }

      // Get the responding user info
      const respondingUser = interaction.user?.name || interaction.user?.id || 'Slack User';

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: 'SLACK_ANSWERS_RECEIVED',
          entityType: 'ScannedIssue',
          entityId: issueId || '',
          userId: respondingUser,
          changes: JSON.stringify({
            answersCount: answersToSave.length,
            answers: answersToSave.map(a => ({ question: a.question, answer: a.answer })),
          }),
        },
      });

      // JIRA comment writeback (non-mock only)
      if (!settings.mockMode && issueKey && answersToSave.length > 0) {
        try {
          const issue = await prisma.scannedIssue.findUnique({ where: { id: issueId } });
          if (issue) {
            const comment = buildQaComment(
              issueKey,
              issue.readinessScore,
              respondingUser,
              answersToSave.map(a => ({ question: a.question, answer: a.answer })),
            );

            const jiraClient = createJiraClient(settings);
            await jiraClient.addComment(issueKey, comment);
          }
        } catch (writebackError) {
          console.error('JIRA comment writeback failed:', writebackError);
          // Non-fatal
        }
      }

      // Return empty response to close the modal
      return NextResponse.json({ response_action: 'clear' });
    }

    // Unknown view submission — acknowledge
    return NextResponse.json({ response_action: 'clear' });
  }

  // ── Other interaction types ──────────────────────────────────
  return new NextResponse('', { status: 200 });
}
