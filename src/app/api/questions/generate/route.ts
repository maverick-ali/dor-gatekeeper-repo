import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateQuestionsViaLLM } from '@/lib/llm';

// Mock LLM question generation for demo mode
function generateMockQuestions(
  issue: any,
  missingItems: { rule: string; severity: string; suggestion: string }[]
): { missingRule: string; question: string }[] {
  const questionMap: Record<string, string[]> = {
    'Acceptance Criteria Present': [
      'What are the specific acceptance criteria for this story? Please provide 3-5 bullet points.',
      'How will we verify this feature is complete and working correctly?',
    ],
    'Story Points Estimated': [
      'What is the estimated effort/complexity for this story (story points 1-13)?',
    ],
    'Assignee Set': [
      'Who should be assigned to own and deliver this work?',
    ],
    'Technical Design Present': [
      'What is the technical approach for implementing this feature?',
      'Are there any architectural decisions or trade-offs to document?',
    ],
    'Dependencies Identified': [
      'Does this story depend on or block any other work items?',
    ],
    'Test Strategy Defined': [
      'How should this feature be tested? (unit tests, integration, E2E, manual)',
    ],
    'User Impact Documented': [
      'What is the expected impact on end users? Who is affected and how?',
    ],
    'Labels Present': [
      'What labels/tags should be applied to categorize this work? (e.g., frontend, backend, bug)',
    ],
    'Priority Set': [
      'What is the priority level for this story? (Critical, High, Medium, Low)',
    ],
  };

  const questions: { missingRule: string; question: string }[] = [];

  for (const item of missingItems) {
    const ruleQuestions = questionMap[item.rule] || [`Please provide details for: ${item.rule}`];
    for (const q of ruleQuestions) {
      questions.push({ missingRule: item.rule, question: q });
    }
  }

  return questions.slice(0, 6); // Limit to 6 questions per SPEC
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId, regenerate } = body;

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

    // If regenerating, delete old unanswered questions
    if (regenerate) {
      await prisma.qaAnswer.deleteMany({
        where: { issueId, answer: '' },
      });
    } else if (issue.questionsGenerated && issue.answers.length > 0) {
      // Return existing questions
      return NextResponse.json({ questions: issue.answers });
    }

    // Parse missing items (new structured format or legacy string array)
    let missingItems: { rule: string; severity: string; suggestion: string }[];
    try {
      const parsed = JSON.parse(issue.missingItems);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          // Legacy format: array of rule name strings
          missingItems = parsed.map((name: string) => ({ rule: name, severity: 'warn', suggestion: '' }));
        } else {
          missingItems = parsed;
        }
      } else {
        missingItems = [];
      }
    } catch {
      missingItems = [];
    }

    if (missingItems.length === 0) {
      return NextResponse.json({ questions: [], message: 'No missing items to generate questions for' });
    }

    // Determine whether to use real LLM or mock templates
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    let questions: { missingRule: string; question: string }[];

    if (settings && !settings.mockMode && settings.llmApiKey) {
      // Real mode: try LLM generation first
      const llmQuestions = await generateQuestionsViaLLM(
        settings,
        { jiraKey: issue.jiraKey, summary: issue.summary, description: issue.description },
        missingItems,
      );

      if (llmQuestions && llmQuestions.length > 0) {
        questions = llmQuestions;
      } else {
        // Fallback to template-based generation
        console.warn('LLM generation returned no results, falling back to templates');
        questions = generateMockQuestions(issue, missingItems);
      }
    } else {
      // Mock mode or no LLM configured: use template-based generation
      questions = generateMockQuestions(issue, missingItems);
    }

    // Persist questions as QaAnswer records with empty answers
    const savedQuestions = [];
    for (const q of questions) {
      const qa = await prisma.qaAnswer.create({
        data: {
          issueId,
          question: `[${q.missingRule}] ${q.question}`,
          answer: '',
        },
      });
      savedQuestions.push(qa);
    }

    // Mark questions as generated
    await prisma.scannedIssue.update({
      where: { id: issueId },
      data: {
        questionsGenerated: true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ questions: savedQuestions });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
