import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId, question, answer } = body;

    if (!issueId || !question || !answer) {
      return NextResponse.json(
        { error: 'issueId, question, and answer are required' },
        { status: 400 }
      );
    }

    const qaAnswer = await prisma.qaAnswer.create({
      data: {
        issueId,
        question,
        answer,
      },
    });

    // Log the answer in audit log
    await prisma.auditLog.create({
      data: {
        action: 'QUESTION_ANSWERED',
        entityType: 'QaAnswer',
        entityId: qaAnswer.id,
        userId: 'system', // In real app, get from auth
        changes: JSON.stringify({ question, answer }),
      },
    });

    return NextResponse.json(qaAnswer, { status: 201 });
  } catch (error) {
    console.error('Error saving answer:', error);
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get('issueId');

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 });
    }

    const answers = await prisma.qaAnswer.findMany({
      where: { issueId },
      orderBy: { answeredAt: 'desc' },
    });

    return NextResponse.json(answers);
  } catch (error) {
    console.error('Error fetching answers:', error);
    return NextResponse.json({ error: 'Failed to fetch answers' }, { status: 500 });
  }
}
