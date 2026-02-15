import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import { decrypt } from './crypto';

/* ── Types ─────────────────────────────────────────────────────── */

export interface SlackSettings {
  slackBotToken: string;    // encrypted in DB
  slackSigningSecret: string; // encrypted in DB
  slackDefaultChannel: string;
  jiraBaseUrl: string;
}

interface QuestionForSlack {
  id: string;
  question: string;
}

/* ── Client Factory ────────────────────────────────────────────── */

/**
 * Create a Slack WebClient using the decrypted bot token.
 */
export function createSlackClient(encryptedBotToken: string): WebClient {
  const token = decrypt(encryptedBotToken);
  return new WebClient(token);
}

/* ── Signature Verification ────────────────────────────────────── */

/**
 * Verify that a request actually came from Slack by checking its signature.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  encryptedSigningSecret: string,
  requestTimestamp: string,
  requestBody: string,
  slackSignature: string,
): boolean {
  const signingSecret = decrypt(encryptedSigningSecret);

  // Check timestamp to prevent replay attacks (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(requestTimestamp, 10);
  if (Math.abs(now - ts) > 300) {
    console.warn('Slack signature verification failed: timestamp too old');
    return false;
  }

  const sigBaseString = `v0:${requestTimestamp}:${requestBody}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBaseString, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(slackSignature, 'utf8'),
  );
}

/* ── User Lookup ───────────────────────────────────────────────── */

/**
 * Look up a Slack user by their email address.
 * Returns the Slack user ID or null if not found.
 */
export async function lookupUserByEmail(
  client: WebClient,
  email: string,
): Promise<string | null> {
  try {
    const result = await client.users.lookupByEmail({ email });
    return result.user?.id || null;
  } catch (error) {
    // users.lookupByEmail throws if user not found
    console.warn(`Slack user lookup failed for ${email}:`, error);
    return null;
  }
}

/* ── Message Sending ───────────────────────────────────────────── */

/**
 * Send a DoR question message to a Slack channel or user DM.
 * Uses Block Kit for rich formatting with an interactive "Answer Questions" button.
 */
export async function sendQuestionMessage(
  client: WebClient,
  channel: string,
  issue: {
    jiraKey: string;
    summary: string;
    readinessScore: number;
    status: string;
    id: string; // internal DB ID for callback
  },
  questions: QuestionForSlack[],
  jiraBaseUrl: string,
): Promise<string | undefined> {
  const jiraLink = jiraBaseUrl
    ? `${jiraBaseUrl.replace(/\/+$/, '')}/browse/${issue.jiraKey}`
    : issue.jiraKey;

  const questionList = questions
    .map((q, i) => `${i + 1}. ${q.question}`)
    .join('\n');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `DoR Gatekeeper: ${issue.jiraKey}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${jiraLink}|${issue.jiraKey}>* — ${issue.summary}\n\n`
          + `*Readiness Score:* ${issue.readinessScore.toFixed(1)}/5.0  |  *Status:* ${issue.status}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Clarifying Questions:*\n${questionList}`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Answer Questions',
            emoji: true,
          },
          style: 'primary',
          action_id: 'answer_questions',
          value: JSON.stringify({
            issueId: issue.id,
            issueKey: issue.jiraKey,
          }),
        },
      ],
    },
  ];

  const result = await client.chat.postMessage({
    channel,
    text: `DoR Gatekeeper: ${issue.jiraKey} needs clarification (score ${issue.readinessScore.toFixed(1)}/5.0)`,
    blocks,
  });

  return result.ts;
}

/* ── Modal Builder ─────────────────────────────────────────────── */

/**
 * Open a Slack modal with input fields for each question.
 */
export async function openAnswerModal(
  client: WebClient,
  triggerId: string,
  issue: { id: string; jiraKey: string; summary: string },
  questions: QuestionForSlack[],
): Promise<void> {
  const inputBlocks = questions.map((q, i) => ({
    type: 'input' as const,
    block_id: `answer_${q.id}`,
    label: {
      type: 'plain_text' as const,
      text: `Q${i + 1}: ${q.question}`.slice(0, 150), // Slack limit
    },
    element: {
      type: 'plain_text_input' as const,
      action_id: `answer_input_${q.id}`,
      multiline: true,
      placeholder: {
        type: 'plain_text' as const,
        text: 'Type your answer here...',
      },
    },
    optional: true,
  }));

  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'dor_answer_modal',
      private_metadata: JSON.stringify({
        issueId: issue.id,
        issueKey: issue.jiraKey,
        questionIds: questions.map(q => q.id),
      }),
      title: {
        type: 'plain_text',
        text: `DoR: ${issue.jiraKey}`,
      },
      submit: {
        type: 'plain_text',
        text: 'Submit Answers',
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${issue.jiraKey}*: ${issue.summary}\n\nPlease answer the questions below to help this issue meet the Definition of Ready.`,
          },
        },
        { type: 'divider' },
        ...inputBlocks,
      ],
    },
  });
}

/* ── Answer Comment Builder ────────────────────────────────────── */

/**
 * Build a structured comment for JIRA with Q&A answers from Slack.
 */
export function buildQaComment(
  issueKey: string,
  score: number,
  answeredBy: string,
  answers: { question: string; answer: string }[],
): string {
  const lines = [
    '--- DoR Gatekeeper - Q&A Answers ---',
    `Issue: ${issueKey} | Score: ${score.toFixed(1)}/5.0`,
    `Answered by: ${answeredBy}`,
    '',
    'Questions & Answers:',
  ];

  for (const a of answers) {
    lines.push(`  Q: ${a.question}`);
    lines.push(`  A: ${a.answer}`);
    lines.push('');
  }

  lines.push(`Answered at: ${new Date().toISOString()}`);
  lines.push('Next Action: Re-scan recommended to update readiness score.');
  lines.push('--- End DoR Gatekeeper ---');

  return lines.join('\n');
}
