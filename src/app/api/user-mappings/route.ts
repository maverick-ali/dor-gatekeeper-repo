import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const mappings = await prisma.userMapping.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(mappings);
  } catch (error) {
    console.error('Error fetching user mappings:', error);
    return NextResponse.json({ error: 'Failed to fetch user mappings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jiraEmail, slackUserId, slackDisplayName } = body;

    if (!jiraEmail || !slackUserId) {
      return NextResponse.json({ error: 'jiraEmail and slackUserId are required' }, { status: 400 });
    }

    const mapping = await prisma.userMapping.create({
      data: {
        jiraEmail,
        slackUserId,
        slackDisplayName: slackDisplayName || '',
      },
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (error) {
    console.error('Error creating user mapping:', error);
    return NextResponse.json({ error: 'Failed to create user mapping' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    await prisma.userMapping.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'User mapping deleted successfully' });
  } catch (error) {
    console.error('Error deleting user mapping:', error);
    return NextResponse.json({ error: 'Failed to delete user mapping' }, { status: 500 });
  }
}
