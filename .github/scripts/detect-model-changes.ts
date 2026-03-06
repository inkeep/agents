#!/usr/bin/env node --experimental-strip-types
/// <reference types="node" />
/**
 * Detects new AI models from Vercel AI Gateway and compares against the static model list.
 * Sets GitHub Actions outputs: has_changes (true/false) and prompt (Claude Code prompt).
 *
 * Run with: node --experimental-strip-types .github/scripts/detect-model-changes.ts
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

const GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

type GatewayModel = {
  id: string;
  type?: string; // "language", "embedding", etc.
};

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
  return json.data
    .filter((m) => {
      const slashIndex = m.id.indexOf('/');
      if (slashIndex === -1) return false;
      if (!TRACKED_PROVIDERS.has(m.id.slice(0, slashIndex))) return false;
      if (m.type !== 'language') return false;
      const rawId = m.id.slice(slashIndex + 1);
      if (rawId.endsWith('-chat')) return false;
      if (rawId.includes('-oss-') || rawId.startsWith('oss-')) return false;
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
    `Vercel AI Gateway: fetched ${gatewayModels.length} chat models (anthropic + openai + google)`
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
  const today = new Date().toISOString().split('T')[0];
  const slug = Math.random().toString(36).slice(2, 8);

  const prompt = `New AI models have been detected from Vercel AI Gateway that are not yet in our static model list.

New models to add:
${modelList}

## CRITICAL: Branch and git rules
- You are already on a feature branch. DO NOT create a new branch. DO NOT run git checkout.
- DO NOT push to main under any circumstances.
- When pushing, always use: git push --set-upstream origin $(git branch --show-current)
- Use a single commit with message: "chore: add new models [model-sync]"

## Step 1: Read the files first
Before editing anything, read all 3 target files so you follow their exact patterns and conventions:
- \`packages/agents-core/src/constants/models.ts\`
- \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
- \`agents-cli/src/utils/model-config.ts\`

## Step 2: Update the 3 files

### \`packages/agents-core/src/constants/models.ts\`
- Add new constant entries to the appropriate provider object (ANTHROPIC_MODELS, OPENAI_MODELS, or GOOGLE_MODELS)
- Key naming convention: SCREAMING_SNAKE_CASE derived from the model ID
  - Dots and dashes both become underscores: claude-sonnet-4-6 → CLAUDE_SONNET_4_6, gpt-5.2 → GPT_5_2, gemini-2.5-flash → GEMINI_2_5_FLASH
- Value format: always 'provider/model-id'
  - Anthropic: dashes in model ID → 'anthropic/claude-sonnet-4-6'
  - OpenAI: dots in model ID → 'openai/gpt-5.2'
  - Google: dots in model ID → 'google/gemini-2.5-flash'
- DO NOT modify any existing entries or default values

Before adding any model to any file, decide if it belongs using these rules. If a model is skipped, do not add it to the constants file, the UI, or the CLI.

ADD the model if it is any of:
- A general-purpose text generation or chat completion model, regardless of how old it is (gpt-3.5-turbo, gpt-4-turbo, gpt-4o, claude-3-opus, gemini-2.0-flash, etc.)
- A reasoning or thinking model (o1, o3, o3-mini, o3-pro, o4-mini, etc.)
- A code generation model (codex, codex-mini, gpt-5-codex, etc.)

SKIP the model entirely (do not add it anywhere) if its ID contains any of these keywords: instruct, embedding, tts, whisper, dall-e, moderation, realtime, audio, search-preview, deep-research, safeguard, oss, instant
SKIP if its ID ends in "-chat", "-image", or "-image-preview"
SKIP if it is a dated preview or snapshot variant with a date suffix (e.g. gemini-2.5-flash-preview-09-2025, claude-3-5-sonnet-20240620) — only add the non-dated alias
If you are uncertain whether a model belongs, skip it

### \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
- Read the file first and follow the exact existing structure
- Add a label entry in the appropriate provider's array for each model that passed the check above
- Human-readable label: 'Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 2.5 Flash' (match existing style)
- Ordering: newest version first, then by tier (Opus/Pro > Sonnet/Flash > Haiku/Flash Lite/Nano/Mini)

### \`agents-cli/src/utils/model-config.ts\`
- Same rules as above — same ordering and label style

## Step 3: Create changeset
Create \`.changeset/add-models-${today}-${slug}.md\` with the following structure. For the description line, list only the models you actually added (not the ones you skipped):
---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-cli": patch
---

Add new models: <comma-separated list of provider/model-id for each model you added>

## Step 4: Commit, push, and open PR
1. git add the 4 changed files (3 source files + the changeset)
2. git commit -m "chore: add new models [model-sync]"
3. git push --set-upstream origin $(git branch --show-current)
4. Create a PR targeting main with:
   - Title: "chore: add new models from provider APIs [model-sync]"
   - Label: "model-sync" (create it if it doesn't exist, color #0075ca)
   - Body: list the models added and which files were updated`;

  setOutput('has_changes', 'true');
  setOutput('prompt', prompt);
}

main().catch((err) => {
  console.error('Detection script failed:', err);
  process.exit(1);
});
