'use client';
// ============================================================
// src/app/connect/page.tsx
// Slack installation page with Nango Connect
// ============================================================

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Connect Page
 *
 * Flow (using backend Connect Sessions, NOT frontend public key):
 * 1. User clicks "Add to Slack"
 * 2. We call /api/nango/connect to create a session
 * 3. Redirect to the Nango connect URL
 * 4. Nango handles OAuth
 * 5. Nango sends webhook to /api/nango/webhook with connectionId
 * 6. User is redirected to /connect/success
 */
export default function ConnectPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for error from OAuth callback
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/nango/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Optional: pass tenant/project context
          // endUserId: 'your-tenant-id',
        }),
      });

      const data = await res.json();

      if (data.connectUrl) {
        window.location.href = data.connectUrl;
      } else {
        setError(data.error || 'Failed to create connection');
      }
    } catch (err) {
      console.error('Connect error:', err);
      setError('Failed to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🤖</div>
        <h1 style={styles.title}>Connect Inkeep to Slack</h1>
        <p style={styles.subtitle}>Install Inkeep to get AI-powered assistance in your workspace</p>

        {error && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>⚠️ {error}</p>
            <button type="button" onClick={() => setError(null)} style={styles.dismissButton}>
              Dismiss
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Connecting...' : 'Add to Slack'}
        </button>

        <div style={styles.features}>
          <h3>What you&apos;ll get:</h3>
          <ul>
            <li>
              ✨ Ask questions with <code>/ask</code>
            </li>
            <li>💬 Get answers in any channel</li>
            <li>🧵 Summarize threads instantly</li>
            <li>📚 Access your knowledge base</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    padding: '2rem',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '3rem',
    maxWidth: '420px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  logo: { fontSize: '4rem', marginBottom: '1rem' },
  title: { margin: '0 0 0.5rem', fontSize: '1.5rem' },
  subtitle: { margin: '0 0 1.5rem', color: '#666' },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  errorText: {
    color: '#dc2626',
    margin: '0 0 0.5rem',
    fontSize: '0.9rem',
  },
  dismissButton: {
    background: 'transparent',
    border: 'none',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '0.8rem',
    textDecoration: 'underline',
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    background: '#4A154B',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
  },
  features: { marginTop: '2rem', textAlign: 'left' as const },
};
