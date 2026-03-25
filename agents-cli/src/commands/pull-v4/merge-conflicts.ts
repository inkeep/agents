import { styleText } from 'node:util';
import type { ConflictItem, ConflictResolution } from '@inkeep/agents-core';
import { render } from 'ink';
import { createElement } from 'react';
import { MergeApp } from './merge-ui/merge-app';

export interface ResolveConflictsOptions {
  conflictStrategy?: 'ours' | 'theirs';
}

function formatEntityId(primaryKey: Record<string, string>): string {
  const values = Object.values(primaryKey);
  return values.length === 1 ? values[0] : values.join('/');
}

function formatDiffType(diffType: string): string {
  switch (diffType) {
    case 'added':
      return styleText('green', 'added');
    case 'removed':
      return styleText('red', 'deleted');
    case 'modified':
      return styleText('yellow', 'modified');
    default:
      return diffType;
  }
}

function formatConflictDescription(conflict: ConflictItem): string {
  const entity = formatEntityId(conflict.primaryKey);
  const ours = formatDiffType(conflict.ourDiffType);
  const theirs = formatDiffType(conflict.theirDiffType);
  return `${styleText('cyan', conflict.table)} ${styleText('bold', entity)}  local: ${ours} | remote: ${theirs}`;
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

  console.log(styleText('yellow', `\n${conflicts.length} conflict(s) found:\n`));

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    console.log(`  ${i + 1}. ${formatConflictDescription(conflict)}`);
  }

  console.log();

  const instance = render(createElement(MergeApp, { conflicts }));
  const result = await instance.waitUntilExit();

  if (result instanceof Error) {
    throw result;
  }

  return result as ConflictResolution[];
}
