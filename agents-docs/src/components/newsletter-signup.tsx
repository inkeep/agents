'use client';

import { type FormEvent, useId, useState } from 'react';

const SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_NEWSLETTER_SUBSCRIBE_URL ?? 'https://inkeep.com/api/newsletter/subscribe';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function NewsletterSignup() {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus('submitting');
    setErrorMsg('');

    const res = await fetch(SUBSCRIBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setStatus('error');
      setErrorMsg((data as { error?: string }).error || 'Something went wrong');
      return;
    }

    setStatus('success');
    setEmail('');
  }

  if (status === 'success') {
    return (
      <div className="newsletter-signup newsletter-signup-success">
        <p className="newsletter-signup-success-text">You&apos;re subscribed!</p>
      </div>
    );
  }

  return (
    <div className="newsletter-signup">
      <p className="newsletter-signup-title">Agents Newsletter</p>
      <form onSubmit={handleSubmit} className="newsletter-signup-form">
        <label htmlFor={inputId} className="sr-only">
          Email
        </label>
        <input
          id={inputId}
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting'}
          className="newsletter-signup-input"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="newsletter-signup-button"
        >
          {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
        </button>
      </form>
      {status === 'error' && <p className="newsletter-signup-error">{errorMsg}</p>}
    </div>
  );
}
