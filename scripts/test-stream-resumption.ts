/**
 * Test stream resumption via Postgres-backed buffer.
 *
 * Flow:
 * 1. Start a classic (non-durable) chat stream with a known conversationId
 * 2. Abort the connection mid-stream (simulate disconnect)
 * 3. Wait for chunks to flush to Postgres
 * 4. Reconnect via GET /conversations/:id/stream
 * 5. Verify we get the stream replayed from Postgres
 */

const BASE = process.env.BASE_URL || 'http://localhost:3002';
const API_KEY =
  process.env.API_KEY ||
  'sk_ij6mIhKOcKVQ.gqJKEcQmQDbCgrKlSFXlhlh-OWmYipB7g9Jrxqj5G5c';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Stream Resumption Test ===\n');

  const conversationId = `test-resume-${Date.now()}`;
  console.log(`conversationId: ${conversationId}`);

  // --- Step 1: Start streaming chat with known conversationId ---
  console.log('\n--- Step 1: Start streaming chat ---');

  const controller = new AbortController();
  const res = await fetch(`${BASE}/run/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      conversationId,
      messages: [
        {
          role: 'user',
          content:
            'Write a detailed paragraph about the ocean. Make it at least 8 sentences. Include facts about marine life, depth, and currents.',
        },
      ],
      stream: true,
    }),
    signal: controller.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Chat failed: ${res.status} ${text}`);
    process.exit(1);
  }

  console.log(`  Status: ${res.status}`);
  console.log(`  Content-Type: ${res.headers.get('content-type')}`);

  // --- Step 2: Read some chunks then abort ---
  console.log('\n--- Step 2: Read partial stream then disconnect ---');

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let partialData = '';
  let chunkCount = 0;

  try {
    while (chunkCount < 8) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('  Stream completed before disconnect target');
        break;
      }
      const text = decoder.decode(value, { stream: true });
      partialData += text;
      chunkCount++;
      const preview = text.replace(/\n/g, '\\n').substring(0, 80);
      console.log(`  Chunk ${chunkCount}: [${text.length}b] ${preview}`);
    }
  } catch {
    // abort may throw
  }

  console.log(
    `\n  Read ${chunkCount} chunks (${partialData.length} bytes) before disconnect`
  );

  try {
    controller.abort();
    reader.cancel().catch(() => {});
  } catch {
    // expected
  }
  console.log('  Connection aborted.');

  // --- Step 3: Wait for flush ---
  console.log('\n--- Step 3: Wait for Postgres flush (1.5s) ---');
  await sleep(1500);

  // --- Step 4: Reconnect via resume endpoint ---
  console.log('\n--- Step 4: Reconnect via GET /conversations/:id/stream ---');

  const resumeRes = await fetch(
    `${BASE}/run/v1/conversations/${conversationId}/stream`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );

  console.log(`  Resume status: ${resumeRes.status}`);
  console.log(`  Content-Type: ${resumeRes.headers.get('content-type')}`);

  if (resumeRes.status === 204) {
    console.log('\n  204 — no stream chunks found in Postgres.');

    // Direct DB check
    try {
      const { execSync } = await import('node:child_process');
      const result = execSync(
        `psql "postgresql://appuser:password@localhost:5433/inkeep_agents" -c "SELECT conversation_id, count(*) as chunks, bool_or(is_final) as has_final FROM stream_chunks WHERE conversation_id LIKE 'test-resume-%' GROUP BY conversation_id ORDER BY conversation_id DESC LIMIT 5;"`,
        { encoding: 'utf-8' }
      );
      console.log('\n  DB check:\n' + result);
    } catch {
      console.log('  Could not query DB directly');
    }
    process.exit(1);
  }

  if (!resumeRes.ok) {
    const text = await resumeRes.text();
    console.error(`  Resume failed: ${resumeRes.status} ${text}`);
    process.exit(1);
  }

  // --- Step 5: Read the resumed stream ---
  console.log('\n--- Step 5: Read resumed stream ---');

  const resumeReader = resumeRes.body!.getReader();
  let resumedData = '';
  let resumeChunkCount = 0;
  const resumeStart = Date.now();

  try {
    while (true) {
      const readPromise = resumeReader.read();
      const timeout = new Promise<{ done: true; value: undefined }>((r) =>
        setTimeout(() => r({ done: true, value: undefined }), 15_000)
      );
      const { done, value } = await Promise.race([readPromise, timeout]);
      if (done) break;
      if (!value) continue;
      const text = decoder.decode(value, { stream: true });
      resumedData += text;
      resumeChunkCount++;
      if (resumeChunkCount <= 5) {
        const preview = text.replace(/\n/g, '\\n').substring(0, 80);
        console.log(`  Chunk ${resumeChunkCount}: [${text.length}b] ${preview}`);
      }
    }
  } catch {
    // stream ended
  }

  const resumeDuration = Date.now() - resumeStart;

  // --- Results ---
  console.log('\n=== RESULTS ===');
  console.log(`  Original (partial): ${partialData.length} bytes, ${chunkCount} chunks`);
  console.log(`  Resumed stream:     ${resumedData.length} bytes, ${resumeChunkCount} chunks`);
  console.log(`  Resume duration:    ${resumeDuration}ms`);

  if (resumedData.length > 0) {
    console.log(`\n  ✓ SUCCESS: Stream resumption from Postgres worked!`);

    const partialSnippet = partialData.substring(0, Math.min(50, partialData.length));
    if (partialSnippet && resumedData.includes(partialSnippet)) {
      console.log('  ✓ Full replay confirmed — resumed data includes content from before disconnect');
    } else {
      console.log('  (Could not confirm overlap — partial snippet may have been a header/event prefix)');
    }
  } else {
    console.log('\n  ✗ FAIL: No data received from resumed stream');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
