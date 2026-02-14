import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const issues = await prisma.scannedIssue.findMany({
      include: {
        answers: true,
      },
      orderBy: { scannedAt: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Jira Key', 'Summary', 'Assignee', 'Readiness Score', 'Status', 'Missing Items'];
      const rows = issues.map(issue => [
        issue.jiraKey,
        issue.summary,
        issue.assignee,
        issue.readinessScore.toFixed(2),
        issue.status,
        issue.missingItems,
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="dor-report.csv"',
        },
      });
    }

    // Default to JSON
    return NextResponse.json(issues);
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
