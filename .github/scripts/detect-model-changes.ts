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
  released?: number; // Unix timestamp — actual model release date
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

async function fetchGatewayModels(): Promise<
  Array<{ provider: string; id: string; released?: number }>
> {
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
      return { provider, id, released: m.released };
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
  released?: number;
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

  const today = new Date().toISOString().split('T')[0];
  const modelList = newModels
    .map((m) => {
      const releasedStr = m.released
        ? ` (released: ${new Date(m.released * 1000).toISOString().split('T')[0]})`
        : '';
      return `- ${m.provider}/${m.id}${releasedStr}`;
    })
    .join('\n');
  const slug = Math.random().toString(36).slice(2, 8);

  const prompt = `Today's date: ${today}

New AI models have been detected from Vercel AI Gateway that are not yet in our static model list.

New models to add:
${modelList}

## CRITICAL: Branch and git rules
- You are already on a feature branch. DO NOT create a new branch. DO NOT run git checkout.
- DO NOT push to main under any circumstances.
- When pushing, always use: git push --set-upstream origin $(git branch --show-current)
- Use a single commit with message: "chore: add new models [model-sync]"

## Step 1: Research model generations
Before touching any files, use WebSearch to research each provider's model history and the new models listed above.

A new "era" is defined by a significant capability leap — a mid-generation release with a meaningfully new architecture, substantially better benchmarks, or a new modality counts as its own era, even if the version number is a minor bump.

Use the following as your starting baseline. Use WebSearch to verify and extend with any newer eras:

| Provider | Known eras (oldest → newest) |
|---|---|
| Anthropic | Claude 3 → Claude 3.5 (own era — significant leap) → Claude 4 → … |
| OpenAI | GPT-4 → GPT-4o (own era — significant leap) → GPT-5 → … |
| Google | Gemini 1 → Gemini 1.5 (own era — significant leap) → Gemini 2 → … |

For each provider with new models, confirm:
- Which era the new model(s) belong to
- Which era is one back from the current
- Which existing UI entries are now two or more eras behind and should be pruned

**Output your era classification in the PR body** so reviewers can verify the pruning decisions before merge.

**If you cannot determine clear era boundaries from your research, default to adding all new models as FULL tier and skip era pruning for this run. Note this in the PR body.**

## Step 2: Read the files first
Before editing anything, read all 3 target files so you follow their exact patterns and conventions:
- \`packages/agents-core/src/constants/models.ts\`
- \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
- \`agents-cli/src/utils/model-config.ts\`

## Step 3: Update the 3 files

First, classify each new model using the era research from Step 1 and these rules:

SKIP entirely (do not add anywhere) if the model ID contains: instruct, embedding, tts, whisper, dall-e, moderation, realtime, audio, search-preview, deep-research, safeguard, oss, instant
SKIP entirely if the ID ends in "-chat", "-image", or "-image-preview"
If uncertain, skip entirely

For models that pass the skip check, assign a tier:

**CONSTANTS-ONLY** — add to \`models.ts\` only, skip the UI and CLI:
- Any model that is not in the current capability era (one era back or older)
- Any model with a date suffix or date-stamped snapshot (e.g. claude-3-5-sonnet-20240620, gpt-5-2025-08-07) — useful as pinnable constants but should not appear in the UI picker

**FULL** — add to \`models.ts\`, the UI, and the CLI:
- Models in the current capability era without a date suffix
- One specialty model **per provider** per category (reasoning/thinking, code generation) — the most capable/latest for that provider only

### \`packages/agents-core/src/constants/models.ts\`
- Add all non-skipped models (both CONSTANTS-ONLY and FULL tiers)
- Key naming: SCREAMING_SNAKE_CASE — dots and dashes both become underscores (claude-sonnet-4-6 → CLAUDE_SONNET_4_6, gpt-5.2 → GPT_5_2)
- Value format: always 'provider/model-id' (Anthropic uses dashes, OpenAI and Google use dots in the model ID)
- NEVER modify or remove existing entries — constants are exhaustive and permanent, and serve as the comparison baseline for future sync runs

### \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
- Add only **FULL** tier models
- Human-readable label matching existing style: 'Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 2.5 Flash'
- Order: newest first, then by tier (Opus/Pro > Sonnet/Flash > Haiku/Nano/Mini)
- **Era pruning**: after adding, remove existing UI entries that are now two or more eras behind the current era (per your Step 1 research). Keep current era + one era back only.
- **Specialty pruning**: per provider, per category (reasoning, code gen), keep only the single most capable entry

### \`agents-cli/src/utils/model-config.ts\`
- Same rules as the UI — FULL tier only, same era pruning and specialty pruning

## Step 4: Create changeset
Create \`.changeset/add-models-${today}-${slug}.md\` with the following structure. For the description line, list models added and any removed from the UI due to pruning:
---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-cli": patch
---

Add new models: <comma-separated list of provider/model-id added>. Remove from UI: <comma-separated list of any pruned UI entries, or omit this sentence if none removed>

## Step 5: Verify
Run these in order and fix any issues before committing:
1. \`pnpm format\` — auto-fixes formatting
2. \`pnpm typecheck\` — confirms no type errors
3. \`pnpm lint\` — confirms no lint errors

## Step 6: Commit, push, and open PR
1. git add all changed files (source files + the changeset)
2. git commit -m "chore: add new models [model-sync]"
3. git push --set-upstream origin $(git branch --show-current)
4. Create a PR targeting main with:
   - Title: "chore: add new models from provider APIs [model-sync]"
   - Label: "model-sync" (create it if it doesn't exist, color #0075ca)
   - Body: include (1) era classification per provider used to make decisions, (2) models added, (3) models removed from UI/CLI due to era/specialty pruning, (4) which files were updated`;

  setOutput('has_changes', 'true');
  setOutput('prompt', prompt);
}

main().catch((err) => {
  console.error('Detection script failed:', err);
  process.exit(1);
});
