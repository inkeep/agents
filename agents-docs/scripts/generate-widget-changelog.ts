import fs from 'node:fs';
import path from 'node:path';

const AGENTS_UI_URL =
  'https://api.github.com/repos/inkeep/agents-ui/contents/packages/agents-ui/CHANGELOG.md';
const AGENTS_UI_CLOUD_URL =
  'https://api.github.com/repos/inkeep/agents-ui/contents/packages/react/CHANGELOG.md';

const OUTPUT_PATH = path.join(
  process.cwd(),
  'content/talk-to-your-agents/(chat-components)/changelog.mdx'
);

const FETCH_TIMEOUT_MS = 30_000;

async function fetchChangelog(url: string): Promise<string> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required to fetch the private agents-ui changelog');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Parse a changelog into a map of version → list of "- HASH: description" entry strings.
// Skips pre-release versions and "Updated dependencies" lines.
function parseChangelog(raw: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const parts = raw.split(/^(?=## )/m);

  for (const part of parts) {
    if (!part.startsWith('## ')) continue;
    const firstNewline = part.indexOf('\n');
    const version = part.slice(3, firstNewline).trim();

    if (version.startsWith('0.0.0-rc-')) continue;

    const lines = part.slice(firstNewline + 1).split('\n');
    const entries: string[] = [];
    let current: string | null = null;

    for (const line of lines) {
      if (/^- [a-f0-9]{6,}: /.test(line)) {
        if (current !== null) entries.push(current);
        current = line;
      } else if (current !== null && /^ {2}\S/.test(line)) {
        current += `\n${line}`;
      } else {
        if (current !== null) entries.push(current);
        current = null;
      }
    }
    if (current !== null) entries.push(current);

    map.set(version, entries);
  }

  return map;
}

// Merge cloud and ui entries per version, deduplicating by commit hash.
// Uses cloud versions as the canonical version list.
function mergeChangelogs(
  cloudMap: Map<string, string[]>,
  uiMap: Map<string, string[]>
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const [version, cloudEntries] of cloudMap) {
    const uiEntries = uiMap.get(version) ?? [];
    const seen = new Set<string>();
    const combined: string[] = [];

    for (const entry of [...cloudEntries, ...uiEntries]) {
      const hash = entry.match(/^- ([a-f0-9]{6,}): /)?.[1];
      if (hash && !seen.has(hash)) {
        seen.add(hash);
        combined.push(entry);
      }
    }

    if (combined.length > 0) {
      result.set(version, combined);
    }
  }

  return result;
}

function formatChangelog(versionMap: Map<string, string[]>): string {
  let body = '';
  for (const [version, entries] of versionMap) {
    body += `## ${version}\n\n${entries.join('\n')}\n\n`;
  }
  return body.trimEnd();
}

export async function main(): Promise<void> {
  const [cloudRaw, uiRaw] = await Promise.all([
    fetchChangelog(AGENTS_UI_CLOUD_URL),
    fetchChangelog(AGENTS_UI_URL),
  ]);

  const cloudMap = parseChangelog(cloudRaw);
  const uiMap = parseChangelog(uiRaw);
  const merged = mergeChangelogs(cloudMap, uiMap);

  const mdx = `---
title: Widget Changelog
sidebarTitle: Widget Changelog
description: Changelog for the @inkeep/agents-ui-cloud package
icon: LuHistory
---

{/* AUTO-GENERATED — do not edit directly. Updated by the sync-widget-changelog workflow. */}

${formatChangelog(merged)}
`;

  await fs.promises.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.promises.writeFile(OUTPUT_PATH, mdx);
  console.log('Widget changelog generated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
