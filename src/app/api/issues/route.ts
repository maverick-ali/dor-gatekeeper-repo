import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');

    const where: any = {};
    if (status) where.status = status;
    if (assignee) where.assignee = assignee;

    const issues = await prisma.scannedIssue.findMany({
      where,
      include: {
        answers: true,
      },
      orderBy: { scannedAt: 'desc' },
    });

    return NextResponse.json(issues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 });
  }
}

export async function GET_BY_ID(request: Request, { params }: { params: { id: string } }) {
  try {
    const issue = await prisma.scannedIssue.findUnique({
      where: { id: params.id },
      include: {
        answers: true,
      },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    return NextResponse.json(issue);
  } catch (error) {
    console.error('Error fetching issue:', error);
    return NextResponse.json({ error: 'Failed to fetch issue' }, { status: 500 });
  }
}
