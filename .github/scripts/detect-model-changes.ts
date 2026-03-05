#!/usr/bin/env node --experimental-strip-types
/**
 * Detects new AI models from provider APIs and compares against the static model list.
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

// --- Provider API fetchers ---

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 20;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const allModels: Array<{ id: string; created_at: string }> = [];
  let afterId: string | undefined;

  let pages = 0;
  do {
    pages++;
    const url = new URL('https://api.anthropic.com/v1/models');
    url.searchParams.set('limit', '100');
    if (afterId) url.searchParams.set('after_id', afterId);

    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as {
      data: Array<{ id: string; created_at: string }>;
      has_more: boolean;
      last_id?: string;
    };
    if (!Array.isArray(data.data)) {
      throw new Error(`Anthropic API returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
    }
    allModels.push(...data.data);
    if (data.has_more && !data.last_id) {
      throw new Error('Anthropic API returned has_more=true but no last_id for pagination');
    }
    afterId = data.has_more ? data.last_id : undefined;
  } while (afterId && pages < MAX_PAGES);

  const cutoff = Date.now() - NINETY_DAYS_MS;
  return allModels.filter((m) => new Date(m.created_at).getTime() >= cutoff).map((m) => m.id);
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as {
    data: Array<{ id: string; owned_by: string; created: number }>;
  };
  if (!Array.isArray(data.data)) {
    throw new Error(`OpenAI API returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const NON_CHAT_PATTERNS = [
    /embed/i,
    /dall-e/i,
    /whisper/i,
    /tts/i,
    /moderation/i,
    /-instruct/i,
    /babbage/i,
    /davinci/i,
    /curie/i,
    /\bada\b/i,
    /audio/i,
    /realtime/i,
    /transcribe/i,
    /search/i,
    /image/i,
    /sora/i,
    /codex/i,
    /computer.?use/i,
    /-chat-latest$/i,
  ];

  const cutoff = (Date.now() - NINETY_DAYS_MS) / 1000; // OpenAI uses Unix seconds
  return data.data
    .filter((m) => {
      if (!['openai', 'system'].includes(m.owned_by)) return false;
      if (m.created < cutoff) return false;
      if (NON_CHAT_PATTERNS.some((p) => p.test(m.id))) return false;
      return true;
    })
    .map((m) => m.id);
}

async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const allModels: string[] = [];
  let pageToken: string | undefined;

  // Google API has no creation date — use positive + negative filters
  const NON_CHAT_PATTERNS = [
    /^gemma/i, // open-weights Gemma family
    /tts/i, // text-to-speech
    /image/i, // image generation
    /robotics/i,
    /computer.?use/i,
    /research/i,
    /codex/i,
    /-latest$/i, // unstable pointer aliases
    /customtools/i, // internal variants
  ];

  let pages = 0;
  do {
    pages++;
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) throw new Error(`Google API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as {
      models: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      nextPageToken?: string;
    };
    if (!Array.isArray(data.models)) {
      throw new Error(`Google API returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const chatModels = data.models
      .filter((m) => {
        if (!(m.supportedGenerationMethods ?? []).includes('generateContent')) return false;
        const id = m.name.replace('models/', '');
        if (!id.startsWith('gemini-')) return false; // Gemini only
        if (NON_CHAT_PATTERNS.some((p) => p.test(id))) return false;
        return true;
      })
      .map((m) => m.name.replace('models/', ''));

    allModels.push(...chatModels);
    pageToken = data.nextPageToken;
  } while (pageToken && pages < MAX_PAGES);

  return allModels;
}

// --- Current model set helpers ---

function currentModelIds(models: Record<string, string>): Set<string> {
  return new Set(Object.values(models).map((v) => v.split('/').slice(1).join('/')));
}

// --- GitHub API: idempotency check ---

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

// --- GitHub Actions output helpers ---

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}<<__OUTPUT_EOF__\n${value}\n__OUTPUT_EOF__\n`);
  } else {
    console.log(`\n--- OUTPUT: ${name} ---\n${value}\n`);
  }
}

// --- Main ---

interface NewModel {
  provider: string;
  id: string;
}

async function main(): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPOSITORY ?? 'inkeep/agents';

  const currentAnthropic = currentModelIds(ANTHROPIC_MODELS);
  const currentOpenAI = currentModelIds(OPENAI_MODELS);
  const currentGoogle = currentModelIds(GOOGLE_MODELS);

  const newModels: NewModel[] = [];
  const failures: string[] = [];

  if (anthropicKey) {
    try {
      const ids = await fetchAnthropicModels(anthropicKey);
      console.log(`Anthropic: fetched ${ids.length} models`);
      for (const id of ids) {
        if (!currentAnthropic.has(id)) newModels.push({ provider: 'anthropic', id });
      }
    } catch (err) {
      console.error('Failed to fetch Anthropic models:', err);
      failures.push('anthropic');
    }
  } else {
    console.warn('ANTHROPIC_API_KEY not set — skipping Anthropic');
  }

  if (openaiKey) {
    try {
      const ids = await fetchOpenAIModels(openaiKey);
      console.log(`OpenAI: fetched ${ids.length} chat models`);
      for (const id of ids) {
        if (!currentOpenAI.has(id)) newModels.push({ provider: 'openai', id });
      }
    } catch (err) {
      console.error('Failed to fetch OpenAI models:', err);
      failures.push('openai');
    }
  } else {
    console.warn('OPENAI_API_KEY not set — skipping OpenAI');
  }

  if (googleKey) {
    try {
      const ids = await fetchGoogleModels(googleKey);
      console.log(`Google: fetched ${ids.length} generateContent models`);
      for (const id of ids) {
        if (!currentGoogle.has(id)) newModels.push({ provider: 'google', id });
      }
    } catch (err) {
      console.error('Failed to fetch Google models:', err);
      failures.push('google');
    }
  } else {
    console.warn('GOOGLE_GENERATIVE_AI_API_KEY not set — skipping Google');
  }

  if (failures.length > 0) {
    console.warn(
      `::warning::model-sync: failed to fetch from ${failures.join(', ')}. Results may be incomplete.`
    );
  }

  const configuredProviders = [anthropicKey, openaiKey, googleKey].filter(Boolean).length;
  if (failures.length === configuredProviders && newModels.length === 0) {
    console.error('All configured providers failed. Cannot determine if new models exist.');
    process.exit(1);
  }

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

  const prompt = `New AI models have been detected from provider APIs that are not yet in our static model list.

New models to add:
${modelList}

Please update the following 3 files to include these models:

1. \`packages/agents-core/src/constants/models.ts\`
   - Add new constant entries to the appropriate provider object (ANTHROPIC_MODELS, OPENAI_MODELS, or GOOGLE_MODELS)
   - Key naming convention: SCREAMING_SNAKE_CASE (e.g., CLAUDE_SONNET_4_6 for claude-sonnet-4-6, GPT_5_2 for gpt-5.2, GEMINI_2_5_FLASH for gemini-2.5-flash)
   - Value format: 'provider/model-id' (e.g., 'anthropic/claude-sonnet-4-6')
   - For dated snapshots (e.g., claude-opus-4-6-20260205): add the dated key. If no undated alias exists yet for that model family, add the undated alias too.
   - Do NOT modify any default values

2. \`agents-manage-ui/src/components/agent/configuration/model-options.tsx\`
   - ONLY add entries for undated aliases (e.g., claude-sonnet-4-6, gpt-5.2, gemini-2.5-flash) — do NOT add dated snapshot entries to the UI
   - Add a label entry in the appropriate provider's array in the modelOptions object
   - Use a human-readable label matching existing entries (e.g., 'Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 2.5 Flash')
   - Ordering: newest version first, then by tier (Pro/Opus > Sonnet/Flash > Haiku/Flash Lite/Nano/Mini)

3. \`agents-cli/src/utils/model-config.ts\`
   - Same rules as file 2 — undated aliases only, same ordering

After making changes, open a pull request with:
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
