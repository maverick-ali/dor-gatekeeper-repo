import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectKey = searchParams.get('projectKey');

    let ruleset;
    if (projectKey) {
      ruleset = await prisma.dorRuleset.findFirst({
        where: { projectKey, isActive: true },
        include: { rules: true },
      });
    } else {
      ruleset = await prisma.dorRuleset.findFirst({
        where: { isActive: true },
        include: { rules: true },
      });
    }

    if (!ruleset) {
      return NextResponse.json({ error: 'No active ruleset found' }, { status: 404 });
    }

    return NextResponse.json(ruleset);
  } catch (error) {
    console.error('Error fetching rules:', error);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { ruleId, ...updateData } = body;

    if (!ruleId) {
      return NextResponse.json({ error: 'ruleId is required' }, { status: 400 });
    }

    const rule = await prisma.dorRule.update({
      where: { id: ruleId },
      data: updateData,
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}
