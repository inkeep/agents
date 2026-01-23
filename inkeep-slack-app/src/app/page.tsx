import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🤖 Inkeep Slack App</h1>
      <p>
        Status: <strong style={{ color: 'green' }}>Ready</strong>
      </p>

      <h2>Install</h2>
      <p>
        <Link href="/connect">→ Install to Slack</Link>
      </p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/slack/events</code> — Slack events
        </li>
        <li>
          <code>POST /api/nango/webhook</code> — Nango webhook
        </li>
        <li>
          <code>POST /api/nango/connect</code> — Create connect session
        </li>
        <li>
          <code>GET /api/health</code> — Health check
        </li>
      </ul>

      <h2>Architecture</h2>
      <ul>
        <li>
          Multi-workspace via Bolt <code>authorize</code> function
        </li>
        <li>Nango stores OAuth tokens (auto-refresh)</li>
        <li>Nango connectionIds stored on workspace records</li>
        <li>Backend Connect Sessions (no frontend public key)</li>
      </ul>
    </main>
  );
}
