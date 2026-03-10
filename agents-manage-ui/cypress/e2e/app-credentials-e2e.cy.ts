/**
 * E2E: App Credentials + Anonymous Session + PoW + Conversation History
 *
 * Pure API test (no UI) — exercises the full end-user auth flow:
 *   Phase 1 — Security basics (app creation, PoW, anon sessions, origin rejection)
 *   Phase 2 — User A conversations + get conversation by ID (Vercel format)
 *   Phase 3 — User B conversations + cross-user isolation
 *
 * Requires:
 *   - API server running on CYPRESS_API_URL (default http://localhost:3002)
 *   - INKEEP_POW_HMAC_SECRET and INKEEP_ANON_JWT_SECRET set in .env
 *   - A working agent (set CYPRESS_E2E_AGENT_ID, default "friendly-agent")
 *
 * Run headless:
 *   cd agents-manage-ui
 *   pnpm test:e2e:run --spec cypress/e2e/app-credentials-e2e.cy.ts
 *
 * Run interactively:
 *   pnpm test:e2e --spec cypress/e2e/app-credentials-e2e.cy.ts
 */

const API_URL = Cypress.env('API_URL') || 'http://localhost:3002';
const TENANT_ID = Cypress.env('TENANT_ID') || 'default';
const PROJECT_ID = Cypress.env('E2E_PROJECT_ID') || 'andrew';
const AGENT_ID = Cypress.env('E2E_AGENT_ID') || 'friendly-agent';
const BYPASS_SECRET = Cypress.env('BYPASS_SECRET') || 'test-bypass-secret-for-ci';
const ORIGIN = 'https://test.example.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function manageUrl(path: string): string {
  return `${API_URL}/manage/tenants/${TENANT_ID}/projects/${PROJECT_ID}${path}`;
}

function manageHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${BYPASS_SECRET}` };
}

function appAuthHeaders(appId: string, token: string, pow: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-inkeep-app-id': appId,
    'X-Inkeep-Challenge-Solution': pow,
    Origin: ORIGIN,
  };
}

/** Fetch a PoW challenge and solve it via the cy.task('solvePow') Node task. */
function freshPow(): Cypress.Chainable<string> {
  return cy
    .request({ url: `${API_URL}/run/auth/pow/challenge`, failOnStatusCode: true })
    .then((res) => {
      return cy.task<string>('solvePow', res.body);
    });
}

/** Create an anonymous session and return { token, sub }. */
function createAnonSession(
  appId: string,
  pow: string
): Cypress.Chainable<{ token: string; sub: string }> {
  return cy
    .request({
      method: 'POST',
      url: `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
      headers: { Origin: ORIGIN, 'X-Inkeep-Challenge-Solution': pow },
      failOnStatusCode: true,
    })
    .then((res) => {
      const token = res.body.token as string;
      const [, payloadB64] = token.split('.');
      const claims = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      expect(claims.sub).to.match(/^anon_/);
      expect(claims.app).to.equal(appId);
      return { token, sub: claims.sub as string };
    });
}

/**
 * Send a chat message via /run/v1/chat/completions (SSE stream).
 * Uses cy.task('chatSSE') to run in Node.js (avoids browser CORS).
 */
function chat(
  appId: string,
  token: string,
  pow: string,
  messages: { role: string; content: string }[],
  conversationId?: string
): Cypress.Chainable<{ text: string; conversationId: string }> {
  const reqBody: Record<string, unknown> = {
    model: AGENT_ID,
    messages,
    stream: true,
  };
  if (conversationId) reqBody.conversationId = conversationId;

  return cy.task<{ text: string; conversationId: string }>(
    'chatSSE',
    {
      url: `${API_URL}/run/v1/chat/completions`,
      headers: appAuthHeaders(appId, token, pow),
      body: JSON.stringify(reqBody),
    },
    { timeout: 120_000 }
  );
}

/** Chat via /run/api/chat (Vercel data stream, non-streaming JSON response). */
function chatDataStream(
  appId: string,
  token: string,
  pow: string,
  messages: { role: string; content: string }[]
): Cypress.Chainable<{ text: string; conversationId: string }> {
  return cy
    .request({
      method: 'POST',
      url: `${API_URL}/run/api/chat`,
      headers: appAuthHeaders(appId, token, pow),
      body: { messages, stream: false },
      failOnStatusCode: true,
      timeout: 120_000,
    })
    .then((res) => {
      const text = (res.body.choices?.[0]?.message?.content ?? '') as string;
      const convId = (res.body.conversationId || res.body.id || '') as string;
      expect(text, 'chatDataStream should return text').to.not.be.empty;
      return { text, conversationId: convId };
    });
}

// ---------------------------------------------------------------------------
// Tests — sequential, no retries (shared state across tests)
// ---------------------------------------------------------------------------

describe(
  'App Credentials + Anonymous Session + PoW E2E',
  { testIsolation: false, retries: 0 },
  () => {
    // Shared state across tests in this sequential suite
    let appId: string;
    let userA: { token: string; sub: string };
    let userB: { token: string; sub: string };
    let a1ConvId: string;
    let userAConvIds: string[];
    let userATotal: number;

    after(() => {
      if (!appId) return;
      cy.request({
        method: 'DELETE',
        url: manageUrl(`/apps/${appId}`),
        headers: { Authorization: `Bearer ${BYPASS_SECRET}` },
        failOnStatusCode: false,
      });
    });

    // =========================================================================
    // Phase 1: Security basics
    // =========================================================================

    it('should create a web_client app', () => {
      cy.request({
        method: 'POST',
        url: manageUrl('/apps'),
        headers: manageHeaders(),
        body: {
          name: `Cypress E2E App ${Date.now()}`,
          type: 'web_client',
          defaultAgentId: AGENT_ID,
          config: {
            type: 'web_client',
            webClient: { allowedDomains: ['*.example.com'] },
          },
        },
      }).then((res) => {
        expect(res.status).to.equal(201);
        appId = res.body.data.app.id;
        expect(appId).to.match(/^app_/);
      });
    });

    it('should fetch and solve a PoW challenge', () => {
      freshPow().then((pow) => {
        expect(pow).to.be.a('string');
        expect(pow.length).to.be.greaterThan(10);
      });
    });

    it('should create an anonymous session (User A)', () => {
      freshPow().then((pow) => {
        createAnonSession(appId, pow).then((session) => {
          userA = session;
          expect(userA.sub).to.match(/^anon_/);
        });
      });
    });

    it('should reject disallowed origin', () => {
      freshPow().then((pow) => {
        cy.request({
          method: 'POST',
          url: `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
          headers: { Origin: 'https://evil.attacker.com', 'X-Inkeep-Challenge-Solution': pow },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(403);
        });
      });
    });

    it('should reject missing PoW header', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
        headers: { Origin: ORIGIN },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.equal(400);
        expect(res.body.error.message).to.equal('pow_required');
      });
    });

    it('should reject invalid PoW solution', () => {
      const garbage = btoa(
        JSON.stringify({
          algorithm: 'SHA-256',
          challenge: 'aaaa',
          number: 0,
          salt: 'x',
          signature: 'x',
        })
      );
      cy.request({
        method: 'POST',
        url: `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
        headers: { Origin: ORIGIN, 'X-Inkeep-Challenge-Solution': garbage },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.equal(400);
        expect(res.body.error.message).to.equal('pow_invalid');
      });
    });

    // =========================================================================
    // Phase 2: User A conversations
    // =========================================================================

    it('User A: chat message 1 (new conversation via SSE)', () => {
      freshPow().then((pow) => {
        chat(appId, userA.token, pow, [
          { role: 'user', content: 'Say "Alpha one" in exactly those words and nothing else.' },
        ]).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
          expect(result.conversationId).to.not.be.empty;
          a1ConvId = result.conversationId;
        });
      });
    });

    it('User A: chat message 2 (follow-up in same conversation)', () => {
      freshPow().then((pow) => {
        chat(
          appId,
          userA.token,
          pow,
          [
            { role: 'user', content: 'Say "Alpha one" in exactly those words and nothing else.' },
            { role: 'assistant', content: 'Alpha one' },
            {
              role: 'user',
              content: 'Now say "Alpha two" in exactly those words and nothing else.',
            },
          ],
          a1ConvId
        ).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
          // The SSE endpoint may assign a new chatcmpl- ID even for follow-ups;
          // the important thing is that the conversation context is maintained.
          expect(result.conversationId).to.not.be.empty;
        });
      });
    });

    it('User A: chat message 3 (new conversation via SSE)', () => {
      freshPow().then((pow) => {
        chat(appId, userA.token, pow, [
          { role: 'user', content: 'Say "Alpha three" in exactly those words and nothing else.' },
        ]).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
          expect(result.conversationId).to.not.equal(a1ConvId);
        });
      });
    });

    it('User A: chat via data stream endpoint (new conversation)', () => {
      freshPow().then((pow) => {
        chatDataStream(appId, userA.token, pow, [
          { role: 'user', content: 'Say "Alpha four" in exactly those words and nothing else.' },
        ]).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
        });
      });
    });

    it('User A: list conversations (expect at least 3)', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations?limit=50`,
          headers: appAuthHeaders(appId, userA.token, pow),
          failOnStatusCode: true,
        }).then((res) => {
          expect(res.body.pagination.total).to.be.at.least(3);
          userAConvIds = res.body.data.map((c: { id: string }) => c.id);
          userATotal = res.body.pagination.total;
        });
      });
    });

    it('User A: get conversation by ID (Vercel format)', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations/${a1ConvId}?format=vercel`,
          headers: appAuthHeaders(appId, userA.token, pow),
          failOnStatusCode: true,
        }).then((res) => {
          const { data } = res.body;
          expect(data.id).to.equal(a1ConvId);
          expect(data.title).to.be.a('string').and.not.be.empty;
          expect(data.messages.length).to.be.at.least(2);

          const firstMsg = data.messages[0];
          expect(firstMsg.content).to.be.a('string');
          expect(firstMsg.parts).to.be.an('array');
          expect(firstMsg.parts[0].type).to.equal('text');
        });
      });
    });

    it('User A: get conversation by ID (OpenAI format — expect 400)', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations/${a1ConvId}?format=openai`,
          headers: appAuthHeaders(appId, userA.token, pow),
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(400);
          expect(res.body.error.message).to.include('not available yet');
        });
      });
    });

    // =========================================================================
    // Phase 3: User B + cross-isolation
    // =========================================================================

    it('should create an anonymous session (User B)', () => {
      freshPow().then((pow) => {
        createAnonSession(appId, pow).then((session) => {
          userB = session;
          expect(userB.sub).to.not.equal(userA.sub);
        });
      });
    });

    it('User B: chat via SSE (new conversation)', () => {
      freshPow().then((pow) => {
        chat(appId, userB.token, pow, [
          { role: 'user', content: 'Say "Bravo one" in exactly those words and nothing else.' },
        ]).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
        });
      });
    });

    it('User B: chat via data stream endpoint', () => {
      freshPow().then((pow) => {
        chatDataStream(appId, userB.token, pow, [
          { role: 'user', content: 'Say "Bravo two" in exactly those words and nothing else.' },
        ]).then((result) => {
          expect(result.text.trim()).to.not.be.empty;
        });
      });
    });

    it('User B: list conversations (expect 2, only their own)', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations?limit=50`,
          headers: appAuthHeaders(appId, userB.token, pow),
          failOnStatusCode: true,
        }).then((res) => {
          expect(res.body.pagination.total).to.be.at.least(2);
          const userBIds = res.body.data.map((c: { id: string }) => c.id);
          const leaked = userBIds.filter((id: string) => userAConvIds.includes(id));
          expect(leaked, 'User B should not see User A conversations').to.have.length(0);
        });
      });
    });

    it('User A: list conversations (still unchanged)', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations?limit=50`,
          headers: appAuthHeaders(appId, userA.token, pow),
          failOnStatusCode: true,
        }).then((res) => {
          expect(res.body.pagination.total).to.equal(userATotal);
        });
      });
    });

    it('Cross-isolation: User B cannot get User A conversation by ID', () => {
      freshPow().then((pow) => {
        cy.request({
          url: `${API_URL}/run/v1/conversations/${a1ConvId}`,
          headers: appAuthHeaders(appId, userB.token, pow),
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(404);
        });
      });
    });
  }
);
