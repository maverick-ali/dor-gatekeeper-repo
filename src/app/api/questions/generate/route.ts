import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Mock LLM question generation for demo mode
function generateMockQuestions(issue: any, missingItems: string[]): string[] {
  const questions = [];

  if (missingItems.includes('Acceptance Criteria Present')) {
    questions.push('What are the specific acceptance criteria for this story?');
    questions.push('How will we know when this feature is complete?');
  }

  if (missingItems.includes('Story Points Estimated')) {
    questions.push('What is the estimated complexity of this story (story points)?');
  }

  if (missingItems.includes('Technical Design Present')) {
    questions.push('What is the technical approach for implementing this?');
    questions.push('Are there any architectural considerations we should be aware of?');
  }

  if (missingItems.includes('Dependencies Identified')) {
    questions.push('Does this story depend on any other work being completed first?');
  }

  if (missingItems.includes('Test Strategy Defined')) {
    questions.push('How should this feature be tested?');
  }

  if (missingItems.includes('User Impact Documented')) {
    questions.push('What is the expected impact on users?');
  }

  if (missingItems.includes('Priority Set')) {
    questions.push('What is the priority level for this story?');
  }

  return questions.slice(0, 5); // Limit to 5 questions
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId } = body;

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 });
    }

    const issue = await prisma.scannedIssue.findUnique({
      where: { id: issueId },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    if (issue.questionsGenerated) {
      return NextResponse.json({ message: 'Questions already generated for this issue' });
    }

    const missingItems = JSON.parse(issue.missingItems);
    const questions = generateMockQuestions(issue, missingItems);

    // In real implementation, call LLM API here
    // const questions = await callLLM(issue, missingItems);

    await prisma.scannedIssue.update({
      where: { id: issueId },
      data: {
        questionsGenerated: true,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
