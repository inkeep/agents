#!/usr/bin/env node --experimental-strip-types
/**
 * Detects new AI models from Vercel AI Gateway and compares against the static model list.
 * Sets GitHub Actions outputs: has_changes (true/false) and prompt (Claude Code prompt).
 *
 * Run with: node --experimental-strip-types .github/scripts/detect-model-changes.ts
 * Override lookback: DAYS=90 node --experimental-strip-types .github/scripts/detect-model-changes.ts
 */

import { appendFileSync } from 'node:fs';
import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  OPENAI_MODELS,
} from '../../packages/agents-core/src/constants/models.ts';

const GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/models';
const TRACKED_PROVIDERS = new Set(['openai', 'anthropic', 'google']);
const FETCH_TIMEOUT_MS = 30_000;

const rawDays = parseInt(process.env.DAYS ?? '2', 10);
const DAYS = Number.isNaN(rawDays) || rawDays <= 0 ? 2 : rawDays;
const GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

type GatewayModel = {
  id: string;
  type?: string; // "language", "embedding", etc.
  released?: number; // unix seconds — actual provider release date (not gateway import date)
};

function cutoffUnixSeconds(days: number): number {
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

// Anthropic gateway IDs use dots for version numbers (claude-opus-4.6);
// our constants use dashes (claude-opus-4-6). OpenAI and Google use dots in both.
function normalizeAnthropicId(id: string): string {
  return id.replace(/(\d)\.(\d)/g, '$1-$2');
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGatewayModels(): Promise<Array<{ provider: string; id: string }>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (GATEWAY_API_KEY) headers['Authorization'] = `Bearer ${GATEWAY_API_KEY}`;

  const res = await fetchWithTimeout(GATEWAY_ENDPOINT, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vercel AI Gateway error: ${res.status} ${res.statusText}\n${body}`);
  }

  const json = (await res.json()) as { data: GatewayModel[] };
  if (!Array.isArray(json.data)) {
    throw new Error(`Unexpected response format from Vercel AI Gateway: 'data' is not an array`);
  }
  const cutoff = cutoffUnixSeconds(DAYS);

  return json.data
    .filter((m) => {
      const slashIndex = m.id.indexOf('/');
      if (slashIndex === -1) return false;
      if (!TRACKED_PROVIDERS.has(m.id.slice(0, slashIndex))) return false;
      if (m.type !== 'language') return false;
      if (typeof m.released !== 'number' || m.released < cutoff) return false;
      return true;
    })
    .map((m) => {
      const slashIndex = m.id.indexOf('/');
      const provider = m.id.slice(0, slashIndex);
      const rawId = m.id.slice(slashIndex + 1);
      const id = provider === 'anthropic' ? normalizeAnthropicId(rawId) : rawId;
      return { provider, id };
    });
}

function currentModelFullIds(): Set<string> {
  return new Set([
    ...Object.values(ANTHROPIC_MODELS),
    ...Object.values(OPENAI_MODELS),
    ...Object.values(GOOGLE_MODELS),
  ]);
}

async function hasOpenSyncPR(token: string, repo: string): Promise<boolean> {
  const q = encodeURIComponent(`repo:${repo} is:pr is:open label:model-sync`);
  const res = await fetchWithTimeout(`https://api.github.com/search/issues?q=${q}&per_page=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    // Fail-safe: assume a PR exists to avoid creating duplicates when we can't verify
    console.warn(
      `::warning::GitHub API error checking for existing PRs (${res.status}). Skipping to avoid duplicates.`
    );
    return true;
  }
  const data = (await res.json()) as { total_count: number };
  return data.total_count > 0;
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}<<__OUTPUT_EOF__\n${value}\n__OUTPUT_EOF__\n`);
  } else {
    console.log(`\n--- OUTPUT: ${name} ---\n${value}\n`);
  }
}

interface NewModel {
  provider: string;
  id: string;
}

async function main(): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPOSITORY ?? 'inkeep/agents';

  if (!githubToken) {
    console.warn('::warning::GITHUB_TOKEN not set — idempotency check will be skipped.');
  }

  const current = currentModelFullIds();

  const gatewayModels = await fetchGatewayModels().catch((err: unknown): never => {
    console.error('Failed to fetch models from Vercel AI Gateway:', err);
    console.error('::error::Cannot determine if new models exist.');
    throw err;
  });

  console.log(
    `Vercel AI Gateway: fetched ${gatewayModels.length} chat models (anthropic + openai + google, last ${DAYS} days)`
  );

  const newModels: NewModel[] = gatewayModels.filter((m) => !current.has(`${m.provider}/${m.id}`));

  if (newModels.length === 0) {
    console.log('No new models detected. Nothing to do.');
    setOutput('has_changes', 'false');
    setOutput('prompt', '');
    return;
  }

  console.log(`\nNew models detected (${newModels.length}):`);
  for (const m of newModels) console.log(`  + ${m.provider}/${m.id}`);

  if (githubToken) {
    const alreadyOpen = await hasOpenSyncPR(githubToken, githubRepo);
    if (alreadyOpen) {
      console.log('\nAn open model-sync PR already exists. Skipping to avoid duplicates.');
      setOutput('has_changes', 'false');
      setOutput('prompt', '');
      return;
    }
  }

  const modelList = newModels.map((m) => `- ${m.provider}/${m.id}`).join('\n');
  const modelSummary = newModels.map((m) => `${m.provider}/${m.id}`).join(', ');
  const today = new Date().toISOString().split('T')[0];

  const prompt = `New AI models have been detected from Vercel AI Gateway that are not yet in our static model list.

New models to add:
${modelList}

Please update the following 3 files to include these models:

1. \`packages/agents-core/src/constants/models.ts\`
   - Add new constant entries to the appropriate provider object (ANTHROPIC_MODELS, OPENAI_MODELS, or GOOGLE_MODELS)
   - Key naming convention: SCREAMING_SNAKE_CASE (e.g., CLAUDE_SONNET_4_6 for claude-sonnet-4-6, GPT_5_2 for gpt-5.2, GEMINI_2_5_FLASH for gemini-2.5-flash)
   - Value format: 'provider/model-id' — note Anthropic uses dashes in model IDs (e.g., 'anthropic/claude-sonnet-4-6') while OpenAI and Google use dots (e.g., 'openai/gpt-5.2', 'google/gemini-2.5-flash')
   - Do NOT modify any default values

2. \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
   - Add a label entry in the appropriate provider's array in the modelOptions object
   - Use a human-readable label matching existing entries (e.g., 'Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 2.5 Flash')
   - Ordering: newest version first, then by tier (Pro/Opus > Sonnet/Flash > Haiku/Flash Lite/Nano/Mini)

3. \`agents-cli/src/utils/model-config.ts\`
   - Same rules as file 2 — same ordering

After updating the files, create a changeset file at \`.changeset/add-models-${today}.md\` with this exact content:
\`\`\`
---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-cli": patch
---

Add new models: ${modelSummary}
\`\`\`

Finally, open a pull request with:
- Title: "chore: add new models from provider APIs [model-sync]"
- Label: "model-sync" (create the label if it doesn't exist, using color #0075ca)
- Body: list the models added and which files were updated`;

  setOutput('has_changes', 'true');
  setOutput('prompt', prompt);
}

main().catch((err) => {
  console.error('Detection script failed:', err);
  process.exit(1);
});
