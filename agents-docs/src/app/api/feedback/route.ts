import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Feedback] RESEND_API_KEY not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'Feedback message is required' }, { status: 400 });
  }

  const { message, email, page, mood } = body as {
    message: string;
    email?: string;
    page?: string;
    mood?: string;
  };

  const resend = new Resend(apiKey);
  const moodLabel = mood ?? 'not specified';
  const replyTo = email && typeof email === 'string' && email.includes('@') ? email : undefined;

  const { error } = await resend.emails.send({
    from: 'Docs Feedback <feedback@updates.inkeep.com>',
    to: 'gaurav@inkeep.com',
    replyTo,
    subject: `Docs feedback${mood ? ` (${moodLabel})` : ''}`,
    text: [
      `Feedback: ${message}`,
      `Mood: ${moodLabel}`,
      `Page: ${page ?? 'unknown'}`,
      replyTo ? `Reply-to: ${replyTo}` : 'No email provided',
    ].join('\n'),
  });

  if (error) {
    console.error('[Feedback] Resend error:', error);
    return NextResponse.json({ error: 'Failed to send feedback' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
