'use client';

import { usePathname } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

const FEEDBACK_URL = '/api/feedback';

const MOODS = [
  { value: 'unhappy', label: 'Unhappy', emoji: '\u{1F61E}' },
  { value: 'neutral', label: 'Neutral', emoji: '\u{1F610}' },
  { value: 'happy', label: 'Happy', emoji: '\u{1F60A}' },
] as const;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function FeedbackDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mood, setMood] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const pathname = usePathname();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      setStatus('idle');
      setMood('');
      setMessage('');
      setEmail('');
    }
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('submitting');

    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.trim(),
        mood: mood || undefined,
        email: email.trim() || undefined,
        page: pathname,
      }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setStatus('error');
      return;
    }

    setStatus('success');
  }

  return (
    <>
      <button type="button" onClick={open} className="feedback-trigger">
        Share feedback
      </button>

      <dialog ref={dialogRef} className="feedback-dialog">
        {status === 'success' ? (
          <div className="feedback-dialog-inner feedback-success-pane">
            <div className="feedback-success-icon" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
              >
                <title>Success</title>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="feedback-success-heading">Thank you!</p>
            <p className="feedback-success-body">Your feedback helps us improve the docs.</p>
            <button type="button" onClick={close} className="feedback-done-button">
              Done
            </button>
          </div>
        ) : (
          <div className="feedback-dialog-inner">
            <div className="feedback-header">
              <div>
                <p className="feedback-title">Share feedback</p>
                <p className="feedback-subtitle">Tell us how this can be better.</p>
              </div>
              <button type="button" onClick={close} className="feedback-close" aria-label="Close">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="feedback-moods">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(m.value)}
                    className={`feedback-mood${mood === m.value ? ' feedback-mood-active' : ''}`}
                    aria-label={m.label}
                    title={m.label}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>

              <textarea
                required
                placeholder="Your feedback..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={status === 'submitting'}
                className="feedback-textarea"
                rows={3}
              />

              <input
                type="email"
                placeholder="Your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'submitting'}
                className="feedback-email"
              />

              {status === 'error' && (
                <p className="feedback-error">Failed to send. Please try again.</p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting' || !message.trim()}
                className="feedback-submit"
              >
                {status === 'submitting' ? 'Sending...' : 'Send Feedback'}
              </button>
            </form>
          </div>
        )}
      </dialog>
    </>
  );
}
