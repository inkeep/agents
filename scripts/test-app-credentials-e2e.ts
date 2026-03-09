#!/usr/bin/env npx tsx
/**
 * End-to-end test script for the App Credentials + Anonymous Session + PoW flow.
 *
 * Tests:
 *   Phase 1 — Security basics
 *     1. Create a web_client app (with a real agent)
 *     2. PoW challenge fetch + solve
 *     3. Anonymous session (JWT issuance)
 *     4. Origin rejection
 *     5. PoW enforcement — missing header
 *     6. PoW enforcement — invalid solution
 *
 *   Phase 2 — User A conversations
 *     7. User A: chat message 1 (new conversation)
 *     8. User A: chat message 2 (same conversation — follow-up)
 *     9. User A: chat message 3 (new conversation)
 *    10. User A: list conversations — expect 2
 *
 *   Phase 3 — User B conversations + isolation
 *    11. Create anonymous session for User B
 *    12. User B: chat message 1 (new conversation)
 *    13. User B: list conversations — expect 1 (only their own)
 *    14. User A: list conversations — still expect 2 (unchanged)
 *    15. Cross-isolation: verify User B cannot see User A's conversations
 *
 * Zero external dependencies — uses Node.js built-in crypto for PoW.
 *
 * Prerequisites:
 *   1. API server running (`pnpm dev`)
 *   2. Tenant, project, and agent exist
 *   3. Env vars: INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET, INKEEP_POW_HMAC_SECRET (>=32 chars)
 *
 * Usage:
 *   npx tsx scripts/test-app-credentials-e2e.ts
 *
 * Override defaults:
 *   API_URL=http://localhost:3002 \
 *   TENANT_ID=my-tenant \
 *   PROJECT_ID=my-project \
 *   AGENT_ID=my-agent \
 *   BYPASS_SECRET=dev-bypass-secret-123 \
 *   npx tsx scripts/test-app-credentials-e2e.ts
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = process.env.API_URL ?? 'http://localhost:3002';
const TENANT_ID = process.env.TENANT_ID ?? 'default';
const BYPASS_SECRET =
  process.env.BYPASS_SECRET ??
  process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET ??
  'test-bypass-secret-for-ci';
const ORIGIN = process.env.TEST_ORIGIN ?? 'https://test.example.com';
const TOTAL_STEPS = 17;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let resolvedProjectId = process.env.PROJECT_ID ?? '';
let resolvedAgentId = process.env.AGENT_ID ?? '';
let createdAppId: string | null = null;
let currentStep = 0;

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function step(msg: string) {
  currentStep++;
  console.log(`\n[${'='.repeat(60)}]`);
  console.log(`  STEP ${currentStep}/${TOTAL_STEPS}: ${msg}`);
  console.log(`[${'='.repeat(60)}]`);
}

function ok(msg: string) {
  console.log(`  ✅ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ❌ ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function manageUrl(path: string): string {
  return `${API_URL}/manage/tenants/${TENANT_ID}/projects/${resolvedProjectId}${path}`;
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

// ---------------------------------------------------------------------------
// PoW helpers
// ---------------------------------------------------------------------------

interface Challenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

function solvePow(
  challenge: string,
  salt: string,
  algorithm: string,
  maxnumber: number
): { number: number } | null {
  const algo = algorithm.replace('-', '').toLowerCase();
  for (let n = 0; n <= maxnumber; n++) {
    const hash = createHash(algo).update(`${salt}${n}`).digest('hex');
    if (hash === challenge) return { number: n };
  }
  return null;
}

function encodeSolution(c: Challenge, number: number): string {
  return Buffer.from(
    JSON.stringify({
      algorithm: c.algorithm,
      challenge: c.challenge,
      number,
      salt: c.salt,
      signature: c.signature,
    })
  ).toString('base64');
}

async function freshPow(): Promise<string> {
  const { status, body } = await fetchJson(`${API_URL}/run/auth/pow/challenge`);
  if (status === 404) fail('PoW not enabled. Set INKEEP_POW_HMAC_SECRET (>=32 chars).');
  if (status !== 200) fail(`Challenge fetch failed (${status}): ${JSON.stringify(body)}`);

  const c = body as Challenge;
  const t0 = Date.now();
  const sol = solvePow(c.challenge, c.salt, c.algorithm, c.maxnumber);
  if (!sol) fail('PoW solve exhausted maxnumber');
  console.log(`  PoW solved in ${Date.now() - t0}ms (n=${sol.number})`);
  return encodeSolution(c, sol.number);
}

// ---------------------------------------------------------------------------
// Anonymous session helper
// ---------------------------------------------------------------------------

interface AnonSession {
  token: string;
  expiresAt: string;
  sub: string;
}

async function createAnonSession(appId: string, label: string): Promise<AnonSession> {
  const pow = await freshPow();
  const { status, body } = await fetchJson(`${API_URL}/run/auth/apps/${appId}/anonymous-session`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'X-Inkeep-Challenge-Solution': pow,
    },
  });

  if (status !== 200) fail(`Anon session (${label}) failed (${status}): ${JSON.stringify(body)}`);

  const [, payloadB64] = body.token.split('.');
  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  if (!claims.sub?.startsWith('anon_')) fail(`Bad sub: ${claims.sub}`);
  if (claims.app !== appId) fail(`Bad app claim: ${claims.app}`);

  ok(`${label} session: sub=${claims.sub}`);
  return { token: body.token, expiresAt: body.expiresAt, sub: claims.sub };
}

// ---------------------------------------------------------------------------
// Chat helper
// ---------------------------------------------------------------------------

async function chat(
  appId: string,
  token: string,
  messages: { role: string; content: string }[],
  conversationId?: string
): Promise<{ text: string; conversationId: string }> {
  const pow = await freshPow();

  const reqBody: any = {
    model: resolvedAgentId,
    messages,
    stream: true,
  };
  if (conversationId) reqBody.conversationId = conversationId;

  const res = await fetch(`${API_URL}/run/v1/chat/completions`, {
    method: 'POST',
    headers: appAuthHeaders(appId, token, pow),
    body: JSON.stringify(reqBody),
  });

  if (res.status !== 200) {
    const text = await res.text();
    fail(`Chat failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const raw = await res.text();
  let fullText = '';
  let convId = conversationId || '';

  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const chunk = JSON.parse(line.slice(6));
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        if (delta.content.startsWith('{"type":"data-operation"')) {
          try {
            const op = JSON.parse(delta.content);
            if (op.data?.details?.conversationId) convId = op.data.details.conversationId;
          } catch {
            /* ignore */
          }
        } else {
          fullText += delta.content;
        }
      }
      if (chunk.conversationId) convId = chunk.conversationId;
      if (chunk.id && !convId) convId = chunk.id;
      const dataOp = chunk.data ?? chunk;
      if (dataOp?.type === 'completion_complete' && dataOp?.details?.conversationId) {
        convId = dataOp.details.conversationId;
      }
    } catch {
      /* skip */
    }
  }

  if (!fullText) fail(`Empty agent response. Raw (500 chars): ${raw.slice(0, 500)}`);
  return { text: fullText, conversationId: convId };
}

/**
 * Chat via the Vercel data stream endpoint (/run/api/chat) with stream: false
 * for simple JSON response parsing.
 */
async function chatDataStream(
  appId: string,
  token: string,
  messages: { role: string; content: string }[],
  conversationId?: string
): Promise<{ text: string; conversationId: string }> {
  const pow = await freshPow();

  const reqBody: any = {
    messages,
    stream: false,
  };
  if (conversationId) reqBody.conversationId = conversationId;

  const { status, body } = await fetchJson(`${API_URL}/run/api/chat`, {
    method: 'POST',
    headers: appAuthHeaders(appId, token, pow),
    body: JSON.stringify(reqBody),
  });

  if (status !== 200) {
    fail(`chatDataStream failed (${status}): ${JSON.stringify(body, null, 2).slice(0, 500)}`);
  }

  const text = body.choices?.[0]?.message?.content ?? '';
  const convId = conversationId || body.conversationId || body.id || '';
  if (!text) fail(`Empty chatDataStream response: ${JSON.stringify(body).slice(0, 500)}`);
  return { text, conversationId: convId };
}

// ---------------------------------------------------------------------------
// Conversations helper
// ---------------------------------------------------------------------------

async function listConversations(
  appId: string,
  token: string
): Promise<{ ids: string[]; total: number }> {
  const pow = await freshPow();
  const { status, body } = await fetchJson(`${API_URL}/run/v1/conversations?limit=50`, {
    headers: appAuthHeaders(appId, token, pow),
  });

  if (status === 401) fail(`Conversations auth rejected: ${JSON.stringify(body)}`);
  if (status !== 200) fail(`Conversations failed (${status}): ${JSON.stringify(body, null, 2)}`);

  const conversations = body.data?.conversations ?? [];
  const total = body.data?.pagination?.total ?? 0;
  const ids = conversations.map((c: any) => c.id);

  for (const conv of conversations) {
    console.log(
      `    ${conv.id} | agent=${conv.agentId} | title="${conv.title ?? '(none)'}" | ${conv.createdAt}`
    );
  }

  return { ids, total };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  if (!createdAppId) return;
  console.log(`\n🧹 Cleaning up: deleting app ${createdAppId}`);
  try {
    await fetch(manageUrl(`/apps/${createdAppId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BYPASS_SECRET}` },
    });
    console.log('  Cleanup done.');
  } catch (e) {
    console.warn('  Cleanup failed (non-critical):', e);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setup() {
  console.log('🚀 App Credentials + Anonymous Session + PoW — End-to-End Test');
  console.log(`   API_URL:       ${API_URL}`);
  console.log(`   TENANT_ID:     ${TENANT_ID}`);
  console.log(`   PROJECT_ID:    ${resolvedProjectId || '(auto-detect)'}`);
  console.log(`   AGENT_ID:      ${resolvedAgentId || '(auto-detect)'}`);
  console.log(`   ORIGIN:        ${ORIGIN}`);

  if (!resolvedProjectId) {
    console.log('\n  Discovering project...');
    const { status, body } = await fetchJson(
      `${API_URL}/manage/tenants/${TENANT_ID}/projects?limit=50`,
      { headers: manageHeaders() }
    );
    if (status !== 200 || !body.data?.length) fail('No project found. Pass PROJECT_ID=...');
    const preferred = body.data.find((p: any) => p.id !== 'chat-to-edit') || body.data[0];
    resolvedProjectId = preferred.id;
    console.log(`  Using project: ${resolvedProjectId} ("${preferred.name}")`);
  }

  if (!resolvedAgentId) {
    console.log('  Discovering agent...');
    const { status, body } = await fetchJson(manageUrl('/agents?limit=50'), {
      headers: manageHeaders(),
    });
    if (status !== 200 || !body.data?.length) {
      fail(`No agents in project "${resolvedProjectId}". Pass AGENT_ID=...`);
    }
    resolvedAgentId = body.data[0].id;
    console.log(`  Using agent: ${resolvedAgentId} ("${body.data[0].name}")`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await setup();

  try {
    // =====================================================================
    // Phase 1: Security basics
    // =====================================================================

    // Step 1: Create app
    step('Create a web_client app');
    const { status: createStatus, body: createBody } = await fetchJson(manageUrl('/apps'), {
      method: 'POST',
      headers: manageHeaders(),
      body: JSON.stringify({
        name: `E2E Test App ${Date.now()}`,
        type: 'web_client',
        defaultAgentId: resolvedAgentId,
        config: {
          type: 'web_client',
          webClient: { allowedDomains: ['*.example.com'] },
        },
      }),
    });
    if (createStatus !== 201)
      fail(`Expected 201, got ${createStatus}: ${JSON.stringify(createBody, null, 2)}`);
    const appId = createBody.data?.app?.id;
    if (!appId?.startsWith('app_')) fail(`Bad app ID: ${JSON.stringify(createBody, null, 2)}`);
    createdAppId = appId;
    ok(`Created app: ${appId} (agent=${resolvedAgentId})`);

    // Step 2: PoW challenge
    step('Fetch and solve PoW challenge');
    const pow1 = await freshPow();
    ok('Challenge solved');

    // Step 3: Anonymous session — User A
    step('Create anonymous session (User A)');
    const userA = await createAnonSession(appId, 'User A');

    // Step 4: Origin rejection
    step('Verify origin rejection');
    {
      const pow = await freshPow();
      const { status } = await fetchJson(`${API_URL}/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: { Origin: 'https://evil.attacker.com', 'X-Inkeep-Challenge-Solution': pow },
      });
      if (status !== 403) fail(`Expected 403, got ${status}`);
      ok(`Rejected disallowed origin (${status})`);
    }

    // Step 5: Missing PoW
    step('Verify PoW enforcement — missing header');
    {
      const { status, body } = await fetchJson(
        `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
        { method: 'POST', headers: { Origin: ORIGIN } }
      );
      if (status === 400 && body?.error?.message === 'pow_required') {
        ok('Rejected: pow_required');
      } else {
        fail(`Unexpected: ${status} ${JSON.stringify(body)}`);
      }
    }

    // Step 6: Invalid PoW
    step('Verify PoW enforcement — garbage solution');
    {
      const garbage = Buffer.from(
        JSON.stringify({
          algorithm: 'SHA-256',
          challenge: 'aaaa',
          number: 0,
          salt: 'x',
          signature: 'x',
        })
      ).toString('base64');
      const { status, body } = await fetchJson(
        `${API_URL}/run/auth/apps/${appId}/anonymous-session`,
        { method: 'POST', headers: { Origin: ORIGIN, 'X-Inkeep-Challenge-Solution': garbage } }
      );
      if (status === 400 && body?.error?.message === 'pow_invalid') {
        ok('Rejected: pow_invalid');
      } else {
        fail(`Unexpected: ${status} ${JSON.stringify(body)}`);
      }
    }

    // =====================================================================
    // Phase 2: User A conversations
    // =====================================================================

    // Step 7: User A — message 1, new conversation
    step('User A: chat message 1 (new conversation)');
    const a1 = await chat(appId, userA.token, [
      { role: 'user', content: 'Say "Alpha one" in exactly those words and nothing else.' },
    ]);
    ok(`Response: "${a1.text.trim()}" (conv=${a1.conversationId})`);

    // Step 8: User A — message 2, same conversation (follow-up)
    step('User A: chat message 2 (follow-up in same conversation)');
    const a2 = await chat(
      appId,
      userA.token,
      [
        { role: 'user', content: 'Say "Alpha one" in exactly those words and nothing else.' },
        { role: 'assistant', content: a1.text.trim() },
        { role: 'user', content: 'Now say "Alpha two" in exactly those words and nothing else.' },
      ],
      a1.conversationId
    );
    ok(`Response: "${a2.text.trim()}" (conv=${a2.conversationId})`);

    // Step 9: User A — message 3, NEW conversation
    step('User A: chat message 3 (new conversation)');
    const a3 = await chat(appId, userA.token, [
      { role: 'user', content: 'Say "Alpha three" in exactly those words and nothing else.' },
    ]);
    ok(`Response: "${a3.text.trim()}" (conv=${a3.conversationId})`);

    // Step 10: User A — chat via /run/api/chat (data stream endpoint)
    step('User A: chat via /run/api/chat (data stream endpoint, new conversation)');
    const a4 = await chatDataStream(appId, userA.token, [
      { role: 'user', content: 'Say "Alpha four" in exactly those words and nothing else.' },
    ]);
    ok(`Response: "${a4.text.trim()}" (conv=${a4.conversationId})`);

    // Step 11: User A — list conversations (should include data stream conversation)
    step('User A: list conversations (expect at least 3 — completions + data stream)');
    const userAConvs = await listConversations(appId, userA.token);
    ok(`User A has ${userAConvs.total} conversation(s)`);
    if (userAConvs.total < 3) {
      fail(
        `Expected at least 3 conversations for User A (2 completions + 1 data stream), got ${userAConvs.total}`
      );
    }
    const userAConvIds = new Set(userAConvs.ids);

    // =====================================================================
    // Phase 3: User B + cross-isolation
    // =====================================================================

    // Step 11: Create anonymous session — User B
    step('Create anonymous session (User B)');
    const userB = await createAnonSession(appId, 'User B');
    if (userA.sub === userB.sub) fail('User A and B have the same sub — should be unique!');
    ok(`User B sub=${userB.sub} (different from User A sub=${userA.sub})`);

    // Step 13: User B — chat via completions endpoint
    step('User B: chat via /completions (new conversation)');
    const b1 = await chat(appId, userB.token, [
      { role: 'user', content: 'Say "Bravo one" in exactly those words and nothing else.' },
    ]);
    ok(`Response: "${b1.text.trim()}" (conv=${b1.conversationId})`);

    // Step 14: User B — chat via data stream endpoint
    step('User B: chat via /run/api/chat (data stream endpoint)');
    const b2 = await chatDataStream(appId, userB.token, [
      { role: 'user', content: 'Say "Bravo two" in exactly those words and nothing else.' },
    ]);
    ok(`Response: "${b2.text.trim()}" (conv=${b2.conversationId})`);

    // Step 15: User B — list conversations (expect 2: one from each endpoint)
    step('User B: list conversations (expect 2, only their own)');
    const userBConvs = await listConversations(appId, userB.token);
    ok(`User B has ${userBConvs.total} conversation(s)`);

    if (userBConvs.total < 2) {
      fail(
        `Expected at least 2 conversations for User B (completions + data stream), got ${userBConvs.total}`
      );
    }

    // Verify User B cannot see any of User A's conversations
    const leakedToB = userBConvs.ids.filter((id) => userAConvIds.has(id));
    if (leakedToB.length > 0) {
      fail(`ISOLATION BREACH: User B can see User A's conversations: ${leakedToB.join(', ')}`);
    }
    ok("User B cannot see any of User A's conversations");

    // Step 16: User A — list conversations (still the same)
    step('User A: list conversations again (unchanged)');
    const userAConvs2 = await listConversations(appId, userA.token);
    ok(`User A still has ${userAConvs2.total} conversation(s)`);

    if (userAConvs2.total !== userAConvs.total) {
      fail(`User A conversation count changed: was ${userAConvs.total}, now ${userAConvs2.total}`);
    }

    // Verify User A cannot see User B's conversations
    const userBConvIds = new Set(userBConvs.ids);
    const leakedToA = userAConvs2.ids.filter((id) => userBConvIds.has(id));
    if (leakedToA.length > 0) {
      fail(`ISOLATION BREACH: User A can see User B's conversations: ${leakedToA.join(', ')}`);
    }
    ok("User A cannot see any of User B's conversations");

    // Step 17: Explicit cross-check summary
    step('Cross-isolation summary');
    console.log(`  User A (${userA.sub}):`);
    console.log(`    Conversations: ${userAConvs2.ids.join(', ')}`);
    console.log(`  User B (${userB.sub}):`);
    console.log(`    Conversations: ${userBConvs.ids.join(', ')}`);
    console.log(`  Overlap: NONE`);
    ok('Complete conversation isolation between anonymous users verified');

    // =====================================================================
    console.log('\n' + '='.repeat(64));
    console.log(`  🎉 ALL ${TOTAL_STEPS} STEPS PASSED`);
    console.log('='.repeat(64));
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err);
  cleanup().finally(() => process.exit(1));
});
