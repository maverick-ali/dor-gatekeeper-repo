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
    const { ruleId, rulesetId, thresholdReady, thresholdClarification, ...updateData } = body;

    // Update ruleset-level thresholds
    if (rulesetId && (thresholdReady !== undefined || thresholdClarification !== undefined)) {
      // Validate thresholds
      const ready = thresholdReady !== undefined ? Number(thresholdReady) : undefined;
      const clarification = thresholdClarification !== undefined ? Number(thresholdClarification) : undefined;

      if (ready !== undefined && (ready < 0.1 || ready > 5.0)) {
        return NextResponse.json({ error: 'thresholdReady must be between 0.1 and 5.0' }, { status: 400 });
      }
      if (clarification !== undefined && (clarification < 0.1 || clarification > 5.0)) {
        return NextResponse.json({ error: 'thresholdClarification must be between 0.1 and 5.0' }, { status: 400 });
      }
      if (ready !== undefined && clarification !== undefined && ready <= clarification) {
        return NextResponse.json({ error: 'thresholdReady must be greater than thresholdClarification' }, { status: 400 });
      }

      const data: Record<string, number> = {};
      if (ready !== undefined) data.thresholdReady = ready;
      if (clarification !== undefined) data.thresholdClarification = clarification;

      const updatedRuleset = await prisma.dorRuleset.update({
        where: { id: rulesetId },
        data,
        include: { rules: true },
      });

      return NextResponse.json(updatedRuleset);
    }

    // Update individual rule (weight, enabled, etc.)
    if (!ruleId) {
      return NextResponse.json({ error: 'ruleId or rulesetId is required' }, { status: 400 });
    }

    // Validate weight if provided
    if (updateData.weight !== undefined) {
      const weight = Number(updateData.weight);
      if (weight < 0 || weight > 1) {
        return NextResponse.json({ error: 'weight must be between 0.0 and 1.0' }, { status: 400 });
      }
      updateData.weight = weight;
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
