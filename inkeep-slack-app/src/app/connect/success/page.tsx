// ============================================================
// src/app/connect/success/page.tsx
// OAuth success page
// ============================================================

import Link from 'next/link';

export default function SuccessPage() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>✅</div>
        <h1 style={styles.title}>Successfully Connected!</h1>
        <p style={styles.text}>Inkeep has been installed to your Slack workspace.</p>

        <div style={styles.commands}>
          <h3 style={styles.commandsTitle}>Get started:</h3>
          <ul style={styles.commandsList}>
            <li>
              <code>/inkeep</code> — Ask a question
            </li>
            <li>
              <code>/inkeep status</code> — Check configuration
            </li>
            <li>
              <code>/inkeep help</code> — See all commands
            </li>
            <li>
              <code>@Inkeep</code> — Mention in any channel
            </li>
          </ul>
        </div>

        <Link href="/" style={styles.link}>
          ← Back to Home
        </Link>
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
  icon: { fontSize: '4rem', marginBottom: '1rem' },
  title: { margin: '0 0 1rem' },
  text: { color: '#666', marginBottom: '1.5rem' },
  commands: {
    background: '#f8f9fa',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
    textAlign: 'left' as const,
  },
  commandsTitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.95rem',
  },
  commandsList: {
    margin: 0,
    paddingLeft: '1.25rem',
    fontSize: '0.9rem',
    lineHeight: 1.8,
  },
  link: {
    color: '#4A154B',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
