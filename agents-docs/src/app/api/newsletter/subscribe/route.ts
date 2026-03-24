import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.error('[Newsletter] BREVO_API_KEY not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const listIdRaw = process.env.BREVO_NEWSLETTER_LIST_ID || '';
  const listId = listIdRaw.replace(/^#/, '');
  const listIdNum = listId ? parseInt(listId, 10) : undefined;

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes: { SIGNUP_SOURCE: 'docs_toc' },
      listIds: listIdNum && !Number.isNaN(listIdNum) ? [listIdNum] : undefined,
      updateEnabled: true,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => response.text());
    console.error('[Newsletter] Brevo error:', { status: response.status, error: errorData });
    return NextResponse.json({ error: 'Subscription failed. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
