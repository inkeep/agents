#!/usr/bin/env tsx

/**
 * Cache Debug CLI
 *
 * Queries SigNoz for a conversation's LLM operation spans and reports the
 * four prompt-cache SPAN_KEYS plus the derived cache_state per call:
 *   - gen_ai.usage.cache_read.input_tokens
 *   - gen_ai.usage.cache_creation.input_tokens
 *   - cache.intent.marker_count
 *   - cache.intent.prefix_signature
 *
 * Usage:
 *   pnpm cache-debug --conversation-id <id> [--project-id <id>]
 *                    [--lookback-hours <n>] [--json]
 *
 * Environment (same vars agents-api uses to reach SigNoz):
 *   SIGNOZ_URL       Base URL of the SigNoz instance (e.g. http://localhost:8080)
 *   SIGNOZ_API_KEY   SigNoz PAT or refresh JWT
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// This script lives in `public/agents/scripts/` — not a workspace package and
// `public/agents/package.json` does not declare `@inkeep/agents-core` as a
// dependency, so we cannot use the `@inkeep/agents-core/*` package entrypoints
// here. We import directly from the agents-core source tree, matching the
// pattern used by sibling scripts (`setup-oauth-client.ts`, `setup-gateway-client.ts`).
// The symbols below ARE part of the client-exports public surface — re-pointing
// to the package entrypoint would be a one-line change if agents-core is ever
// added as a dependency of `public/agents/`.
import { AI_OPERATIONS, SPAN_KEYS } from '../../packages/agents-core/src/constants/otel-attributes';
import {
  buildCacheDebugQuery,
  CACHE_DEBUG_QUERY_NAME,
} from '../../packages/agents-core/src/utils/cache-debug-query';
import {
  type CacheDebugCall,
  deriveCacheDebugCalls,
} from '../../packages/agents-core/src/utils/cache-debug-walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '..', '.env');

const DEFAULT_LOOKBACK_HOURS = 168;

interface CliArgs {
  conversationId?: string;
  projectId?: string;
  lookbackHours: number;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { lookbackHours: DEFAULT_LOOKBACK_HOURS, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--conversation-id':
        args.conversationId = argv[++i];
        break;
      case '--project-id':
        args.projectId = argv[++i];
        break;
      case '--lookback-hours': {
        const value = Number(argv[++i]);
        if (Number.isFinite(value) && value > 0) args.lookbackHours = value;
        break;
      }
      default:
        break;
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`cache-debug — report prompt-cache telemetry per LLM call for a conversation

Usage:
  pnpm cache-debug --conversation-id <id> [options]

Options:
  --conversation-id <id>   Conversation to inspect (required)
  --project-id <id>        Scope the query to a project (optional)
  --lookback-hours <n>     How far back to search (default: ${DEFAULT_LOOKBACK_HOURS})
  --json                   Emit machine-parseable JSON only
  -h, --help               Show this help

Environment:
  SIGNOZ_URL               Base URL of the SigNoz instance (required)
  SIGNOZ_API_KEY           SigNoz PAT or refresh JWT (required)

Reports these SPAN_KEYS per LLM operation span, plus the derived cache_state:
  ${SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS}
  ${SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS}
  ${SPAN_KEYS.CACHE_INTENT_MARKER_COUNT}
  ${SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE}
`);
}

function readEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess?.trim()) return fromProcess.trim();
  if (!existsSync(ENV_PATH)) return undefined;
  const match = readFileSync(ENV_PATH, 'utf-8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function fail(message: string): never {
  console.error(`cache-debug: ${message}`);
  process.exit(1);
}

function signozAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // JWTs start with 'eyJ' (base64 of `{"`) and use Bearer; SigNoz PATs use the
  // SIGNOZ-API-KEY header. Mirrors agents-api's signoz proxy config.
  if (apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers['SIGNOZ-API-KEY'] = apiKey;
  }
  return headers;
}

type SpanRow = { data?: Record<string, unknown> } & Record<string, unknown>;

function extractResults(signozJson: unknown): Array<{ queryName?: string; rows?: SpanRow[] }> {
  const root = signozJson as
    | { data?: { data?: { results?: unknown }; results?: unknown }; results?: unknown }
    | undefined;
  const results =
    root?.data?.data?.results ?? root?.data?.results ?? root?.results ?? ([] as unknown);
  return Array.isArray(results) ? (results as Array<{ queryName?: string; rows?: SpanRow[] }>) : [];
}

function operationLabel(operationId: string): string {
  if (operationId === AI_OPERATIONS.STREAM_TEXT) return 'stream';
  if (operationId === AI_OPERATIONS.GENERATE_TEXT) return 'generate';
  return operationId || 'unknown';
}

function printHuman(conversationId: string, calls: CacheDebugCall[]): void {
  console.log(`\nCache debug — conversation ${conversationId} (${calls.length} LLM calls)\n`);
  for (const call of calls) {
    console.log(
      [
        call.cacheState.padEnd(24),
        operationLabel(call.operationId).padEnd(9),
        (call.generationType || '-').padEnd(24),
        `in=${call.inputTokens}`,
        `read=${call.cacheReadTokens}`,
        `write=${call.cacheCreationTokens}`,
        `markers=${call.markerCount}`,
        `sig=${call.prefixSignature || '-'}`,
      ].join('  ')
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.conversationId) {
    fail('--conversation-id is required. Run with --help for usage.');
  }

  const signozUrl = readEnv('SIGNOZ_URL');
  if (!signozUrl) {
    fail('SIGNOZ_URL is not set. Set it in public/agents/.env or your environment.');
  }
  const signozApiKey = readEnv('SIGNOZ_API_KEY');
  if (!signozApiKey) {
    fail('SIGNOZ_API_KEY is not set. Set it in public/agents/.env or your environment.');
  }

  const end = Date.now();
  const start = end - args.lookbackHours * 60 * 60 * 1000;
  const query = buildCacheDebugQuery(args.conversationId, {
    start,
    end,
    ...(args.projectId ? { projectId: args.projectId } : {}),
  });

  const endpoint = `${signozUrl.replace(/\/+$/, '')}/api/v5/query_range`;

  let signozJson: unknown;
  // Bound the request the same way the production signozPost proxy does (30s there);
  // 60s here since the CLI is developer tooling, not the request hot path. Without
  // this an unresponsive SigNoz would hang the CLI (and the cache-real-api CI job)
  // indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: signozAuthHeaders(signozApiKey),
      body: JSON.stringify(query),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      fail(`SigNoz query failed (${response.status} ${response.statusText}). ${body}`.trim());
    }
    signozJson = await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SigNoz query failed')) throw error;
    fail(
      `could not reach SigNoz at ${endpoint}: ${error instanceof Error ? error.message : error}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const results = extractResults(signozJson);
  const rows = results.find((r) => r.queryName === CACHE_DEBUG_QUERY_NAME)?.rows ?? [];

  if (rows.length === 0) {
    console.log(`No LLM calls found for conversation ${args.conversationId}.`);
    process.exit(0);
  }

  const calls = deriveCacheDebugCalls(rows);

  if (args.json) {
    console.log(JSON.stringify(calls, null, 2));
  } else {
    printHuman(args.conversationId, calls);
    console.log('\n=== machine-readable (JSON) ===');
    console.log(JSON.stringify(calls));
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('cache-debug: unexpected error', error);
  process.exit(1);
});
