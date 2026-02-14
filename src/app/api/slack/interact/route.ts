import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { payload } = body;

    // Parse Slack interaction payload
    const interaction = typeof payload === 'string' ? JSON.parse(payload) : payload;

    // Handle different interaction types (button clicks, modal submissions, etc.)
    if (interaction.type === 'block_actions') {
      // Handle button clicks from Slack messages
      const action = interaction.actions[0];

      if (action.action_id === 'answer_question') {
        // Open modal for answering question
        return NextResponse.json({ message: 'Modal opened' });
      }
    } else if (interaction.type === 'view_submission') {
      // Handle modal submissions
      const values = interaction.view.state.values;

      // Extract answer and save to database
      // ... implementation here

      return NextResponse.json({ message: 'Answer saved' });
    }

    return NextResponse.json({ message: 'Interaction handled' });
  } catch (error) {
    console.error('Error handling Slack interaction:', error);
    return NextResponse.json({ error: 'Failed to handle interaction' }, { status: 500 });
  }
}
