import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId, manualOverride, overrideReason, newStatus } = body;

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 });
    }

    const issue = await prisma.scannedIssue.update({
      where: { id: issueId },
      data: {
        manualOverride: manualOverride !== undefined ? manualOverride : true,
        overrideReason: overrideReason || '',
        status: newStatus || undefined,
        updatedAt: new Date(),
      },
    });

    // Log the override in audit log
    await prisma.auditLog.create({
      data: {
        action: 'MANUAL_OVERRIDE',
        entityType: 'ScannedIssue',
        entityId: issueId,
        userId: 'system', // In real app, get from auth
        changes: JSON.stringify({ manualOverride, overrideReason, newStatus }),
      },
    });

    return NextResponse.json(issue);
  } catch (error) {
    console.error('Error overriding issue:', error);
    return NextResponse.json({ error: 'Failed to override issue' }, { status: 500 });
  }
}
