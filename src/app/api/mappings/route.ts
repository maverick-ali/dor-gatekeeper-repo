import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// GET all user mappings
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

// POST: create or update a user mapping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jiraEmail, slackUserId, slackDisplayName } = body;

    if (!jiraEmail || !slackUserId) {
      return NextResponse.json(
        { error: 'jiraEmail and slackUserId are required' },
        { status: 400 }
      );
    }

    const mapping = await prisma.userMapping.upsert({
      where: { jiraEmail },
      update: { slackUserId, slackDisplayName: slackDisplayName || '' },
      create: { jiraEmail, slackUserId, slackDisplayName: slackDisplayName || '' },
    });

    return NextResponse.json(mapping);
  } catch (error) {
    console.error('Error saving user mapping:', error);
    return NextResponse.json({ error: 'Failed to save user mapping' }, { status: 500 });
  }
}

// DELETE: remove a user mapping by id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    await prisma.userMapping.delete({ where: { id } });
    return NextResponse.json({ message: 'Mapping deleted' });
  } catch (error) {
    console.error('Error deleting user mapping:', error);
    return NextResponse.json({ error: 'Failed to delete user mapping' }, { status: 500 });
  }
}
