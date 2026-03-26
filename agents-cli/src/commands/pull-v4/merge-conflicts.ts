import { styleText } from 'node:util';
import type { ConflictItem, ConflictResolution } from '@inkeep/agents-core';
import { render } from 'ink';
import { createElement } from 'react';
import { MergeApp } from './merge-ui/merge-app';
import { formatEntityId } from './merge-ui/utils';

export interface ResolveConflictsOptions {
  conflictStrategy?: 'ours' | 'theirs';
}

export async function resolveConflictsInteractive(
  conflicts: ConflictItem[],
  options: ResolveConflictsOptions
): Promise<ConflictResolution[]> {
  if (options.conflictStrategy) {
    const pick = options.conflictStrategy;
    console.log(
      styleText('gray', `\nAuto-resolving ${conflicts.length} conflict(s) with strategy: ${pick}`)
    );
    return conflicts.map((conflict) => ({
      table: conflict.table,
      primaryKey: conflict.primaryKey,
      rowDefaultPick: pick,
    }));
  }

  const instance = render(createElement(MergeApp, { conflicts }));
  const result = await instance.waitUntilExit();

  if (result instanceof Error) {
    throw result;
  }

  const resolutions = result as ConflictResolution[];

  console.log(styleText('green', `\n✓ Resolved ${resolutions.length} conflict(s):`));
  for (const res of resolutions) {
    const entity = formatEntityId(res.primaryKey);
    const overrides = Object.entries(res.columns ?? {}).filter(
      ([, pick]) => pick !== res.rowDefaultPick
    );
    const overrideNote = overrides.length > 0 ? ` (${overrides.length} column override(s))` : '';
    console.log(
      `  ${styleText('cyan', res.table)} ${styleText('bold', entity)} → ${res.rowDefaultPick}${overrideNote}`
    );
  }
  console.log();

  return resolutions;
}
