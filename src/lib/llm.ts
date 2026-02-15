import OpenAI from 'openai';
import { decrypt } from './crypto';

/* ── Types ─────────────────────────────────────────────────────── */

export interface LlmSettings {
  llmProvider: string;
  llmApiKey: string;  // encrypted in DB
  llmModel: string;
  llmBaseUrl: string;
}

interface MissingItem {
  rule: string;
  severity: string;
  suggestion: string;
}

interface GeneratedQuestion {
  missingRule: string;
  question: string;
}

/* ── Provider Base URLs ────────────────────────────────────────── */

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
  groq: 'https://api.groq.com/openai/v1',
  lmstudio: 'http://localhost:1234/v1',
};

/* ── Data Redaction ────────────────────────────────────────────── */

/**
 * Strip potentially sensitive data before sending to LLM.
 * Removes emails, API keys, URLs with tokens, etc.
 */
function redactSensitiveData(text: string): string {
  return text
    // Emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // API keys / tokens (long alphanumeric strings)
    .replace(/(?:key|token|secret|password|auth)[=:\s]+\S{10,}/gi, '[REDACTED_CREDENTIAL]')
    // URLs with query params (may contain tokens)
    .replace(/https?:\/\/\S+\?\S+/g, '[URL_REDACTED]')
    // AWS-style access keys
    .replace(/AKIA[0-9A-Z]{16}/g, '[AWS_KEY_REDACTED]');
}

/* ── Question Generation ───────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a DoR (Definition of Ready) analyst. Given a Jira issue and its missing DoR criteria, generate targeted clarifying questions.

Rules:
- Generate 1-2 questions per missing item, up to 6 total.
- Questions must be specific, short, and actionable.
- Avoid generic "please add more details" questions.
- Each question must reference the specific missing rule.

You MUST respond with valid JSON matching this exact schema:
{
  "questions": [
    {
      "missingRule": "Rule Name",
      "question": "Your specific question here?"
    }
  ]
}

Only return JSON, no markdown or explanation.`;

/**
 * Generate clarifying questions using an OpenAI-compatible LLM.
 * Falls back to null on failure so the caller can use template-based generation.
 */
export async function generateQuestionsViaLLM(
  settings: LlmSettings,
  issue: { jiraKey: string; summary: string; description: string },
  missingItems: MissingItem[],
): Promise<GeneratedQuestion[] | null> {
  try {
    const apiKey = settings.llmApiKey ? decrypt(settings.llmApiKey) : 'not-needed';
    const baseURL =
      settings.llmBaseUrl ||
      PROVIDER_BASE_URLS[settings.llmProvider] ||
      PROVIDER_BASE_URLS.openai;

    const client = new OpenAI({
      apiKey,
      baseURL,
    });

    const redactedDescription = redactSensitiveData(issue.description || '');
    const missingList = missingItems
      .map(m => `- ${m.rule} (${m.severity}): ${m.suggestion}`)
      .join('\n');

    const userPrompt = `Jira Issue: ${issue.jiraKey} - ${issue.summary}

Description (redacted):
${redactedDescription.slice(0, 2000)}

Missing DoR Criteria:
${missingList}

Generate targeted clarifying questions for the missing items above.`;

    const response = await client.chat.completions.create({
      model: settings.llmModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (!parsed.questions || !Array.isArray(parsed.questions)) return null;

    // Validate and limit to 6 questions
    const questions: GeneratedQuestion[] = parsed.questions
      .filter(
        (q: Record<string, unknown>) =>
          typeof q.missingRule === 'string' && typeof q.question === 'string',
      )
      .slice(0, 6)
      .map((q: Record<string, string>) => ({
        missingRule: q.missingRule,
        question: q.question,
      }));

    return questions.length > 0 ? questions : null;
  } catch (error) {
    console.error('LLM question generation failed, will fall back to templates:', error);
    return null;
  }
}
