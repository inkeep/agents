import fs from 'node:fs';
import path from 'node:path';

// GitHub API endpoint — works for private repos when GITHUB_TOKEN is set
const CHANGELOG_URL =
  'https://api.github.com/repos/inkeep/agents-ui/contents/packages/agents-ui/CHANGELOG.md';

const OUTPUT_PATH = path.join(process.cwd(), 'content/guides/widget-changelog.mdx');

export async function main(): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(CHANGELOG_URL, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch changelog: ${response.status} ${response.statusText}`);
  }

  const raw = await response.text();

  // Strip package name heading and pre-release (0.0.0-rc-*) sections
  const body = raw
    .replace(/^# @inkeep\/agents-ui\n+/, '')
    .replace(/^## 0\.0\.0-rc-[^\n]*\n+/gm, '');
  const mdx = `---
title: Widget Changelog
sidebarTitle: Widget Changelog
description: Changelog for the @inkeep/agents-ui-cloud package
icon: LuHistory
---

${body}`;

  await fs.promises.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.promises.writeFile(OUTPUT_PATH, mdx);
  console.log('Widget changelog generated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
