import { styleText } from 'node:util';
import type { ConflictItem, ConflictResolution } from '@inkeep/agents-core';
import { render } from 'ink';
import { createElement } from 'react';
import { MergeApp } from './merge-ui/merge-app';
import { diffTypeColor, formatDiffType, formatEntityId } from './merge-ui/utils';

export interface ResolveConflictsOptions {
  conflictStrategy?: 'ours' | 'theirs';
}

function styledDiffType(diffType: string): string {
  return styleText(
    diffTypeColor(diffType) as Parameters<typeof styleText>[0],
    formatDiffType(diffType)
  );
}

function formatConflictDescription(conflict: ConflictItem): string {
  const entity = formatEntityId(conflict.primaryKey);
  const ours = styledDiffType(conflict.ourDiffType);
  const theirs = styledDiffType(conflict.theirDiffType);
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
