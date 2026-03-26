import type { ConflictItem } from '@inkeep/agents-core';
import { Box, Text } from 'ink';
import { ColumnRow } from './column-row';
import type { ConflictResolutionState, Side } from './types';
import { diffTypeColor, formatDiffType, formatEntityId } from './utils';

interface ConflictViewProps {
  conflict: ConflictItem;
  resolution: ConflictResolutionState;
  changedColumns: string[];
  focusedColumnIndex: number;
  conflictIndex: number;
  totalConflicts: number;
}

export function ConflictView({
  conflict,
  resolution,
  changedColumns,
  focusedColumnIndex,
  conflictIndex,
  totalConflicts,
}: ConflictViewProps) {
  const entityId = formatEntityId(conflict.primaryKey);
  const isNullOurs = conflict.ours === null;
  const isNullTheirs = conflict.theirs === null;

  function getPickForColumn(col: string): Side {
    return resolution.columnOverrides[col] ?? resolution.rowDefaultPick;
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>
            Conflict {conflictIndex + 1}/{totalConflicts}:{' '}
          </Text>
          <Text color="cyan">{conflict.table}</Text>
          <Text bold> &quot;{entityId}&quot;</Text>
          <Text> — local: </Text>
          <Text color={diffTypeColor(conflict.ourDiffType)}>
            {formatDiffType(conflict.ourDiffType)}
          </Text>
          <Text> | remote: </Text>
          <Text color={diffTypeColor(conflict.theirDiffType)}>
            {formatDiffType(conflict.theirDiffType)}
          </Text>
        </Box>

        {isNullOurs || isNullTheirs ? (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text> Pick: </Text>
              <Text bold color="cyan">
                [{resolution.rowDefaultPick}]
              </Text>
              <Text dimColor> (← for ours, → for theirs)</Text>
              <Text color="cyan"> ◂</Text>
            </Box>
            <Box flexDirection="column" marginLeft={2}>
              <Text
                color={resolution.rowDefaultPick === 'ours' ? 'green' : undefined}
                dimColor={resolution.rowDefaultPick !== 'ours'}
              >
                ours: {isNullOurs ? 'Delete this row (keep local deletion)' : 'Keep local version'}
              </Text>
              <Text
                color={resolution.rowDefaultPick === 'theirs' ? 'green' : undefined}
                dimColor={resolution.rowDefaultPick !== 'theirs'}
              >
                theirs:{' '}
                {isNullTheirs ? 'Delete this row (keep remote deletion)' : 'Keep remote version'}
              </Text>
            </Box>
          </Box>
        ) : (
          <>
            <Box marginBottom={1}>
              <Text> Row default: </Text>
              <Text bold color={focusedColumnIndex === -1 ? 'cyan' : undefined}>
                [{resolution.rowDefaultPick}]
              </Text>
              <Text dimColor> (← for ours, → for theirs)</Text>
              {focusedColumnIndex === -1 && <Text color="cyan"> ◂</Text>}
            </Box>

            {changedColumns.map((col, i) => (
              <ColumnRow
                key={col}
                columnName={col}
                oursValue={conflict.ours?.[col]}
                theirsValue={conflict.theirs?.[col]}
                pick={getPickForColumn(col)}
                isFocused={focusedColumnIndex === i}
                isLast={i === changedColumns.length - 1}
              />
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
