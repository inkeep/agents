import { styleText } from 'node:util';
import * as p from '@clack/prompts';
import type { PullV3Options } from './introspect';

export interface ConflictItem {
  table: string;
  primaryKey: Record<string, string>;
  ourDiffType: string;
  theirDiffType: string;
  base: Record<string, unknown> | null;
  ours: Record<string, unknown> | null;
  theirs: Record<string, unknown> | null;
}

export interface ConflictResolution {
  table: string;
  primaryKey: Record<string, string>;
  rowDefaultPick: 'ours' | 'theirs';
  columns?: Record<string, 'ours' | 'theirs'>;
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
  options: PullV3Options
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

  const resolutions: ConflictResolution[] = [];

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    const entity = formatEntityId(conflict.primaryKey);

    const pick = await p.select({
      message: `[${i + 1}/${conflicts.length}] ${conflict.table} "${entity}" — keep which version?`,
      options: [
        {
          value: 'ours' as const,
          label: `ours (local — ${conflict.ourDiffType})`,
        },
        {
          value: 'theirs' as const,
          label: `theirs (remote — ${conflict.theirDiffType})`,
        },
      ],
    });

    if (p.isCancel(pick)) {
      throw new Error('Conflict resolution cancelled');
    }

    resolutions.push({
      table: conflict.table,
      primaryKey: conflict.primaryKey,
      rowDefaultPick: pick,
    });
  }

  console.log(styleText('cyan', '\nResolution summary:'));
  for (const resolution of resolutions) {
    const entity = formatEntityId(resolution.primaryKey);
    const pickLabel = resolution.rowDefaultPick === 'ours' ? 'local' : 'remote';
    console.log(`  ${resolution.table} "${entity}" → ${pickLabel}`);
  }

  const confirmed = await p.confirm({
    message: 'Apply these resolutions?',
  });

  if (p.isCancel(confirmed) || !confirmed) {
    throw new Error('Conflict resolution cancelled');
  }

  return resolutions;
}
