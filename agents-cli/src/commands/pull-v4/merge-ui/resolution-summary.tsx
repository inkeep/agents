import type { ConflictItem } from '@inkeep/agents-core';
import { Box, Text } from 'ink';
import type { ConflictResolutionState, Side } from './types';
import { formatEntityId } from './utils';

interface ResolutionSummaryProps {
  conflicts: ConflictItem[];
  resolutions: ConflictResolutionState[];
  allChangedColumns: string[][];
}

export function ResolutionSummary({
  conflicts,
  resolutions,
  allChangedColumns,
}: ResolutionSummaryProps) {
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          Resolution Summary
        </Text>
        <Text dimColor>{'─'.repeat(50)}</Text>

        {conflicts.map((conflict, i) => {
          const resolution = resolutions[i];
          const changedCols = allChangedColumns[i];
          const entityId = formatEntityId(conflict.primaryKey);
          const hasOverrides = Object.keys(resolution.columnOverrides).length > 0;

          return (
            <Box key={`${conflict.table}-${entityId}`} flexDirection="column" marginY={0}>
              <Box>
                <Text color="cyan">{conflict.table}</Text>
                <Text bold> &quot;{entityId}&quot;</Text>
                <Text> → default: </Text>
                <Text color={resolution.rowDefaultPick === 'ours' ? 'blue' : 'magenta'}>
                  {resolution.rowDefaultPick === 'ours' ? 'local' : 'remote'}
                </Text>
              </Box>
              {hasOverrides && (
                <Box flexDirection="column" marginLeft={2}>
                  {changedCols.map((col) => {
                    const pick: Side = resolution.columnOverrides[col] ?? resolution.rowDefaultPick;
                    const isOverride = col in resolution.columnOverrides;
                    if (!isOverride) return null;
                    return (
                      <Box key={col}>
                        <Text dimColor> ↳ {col}: </Text>
                        <Text color={pick === 'ours' ? 'blue' : 'magenta'}>
                          {pick === 'ours' ? 'local' : 'remote'}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}

        <Box marginTop={1}>
          <Text dimColor>{'─'.repeat(50)}</Text>
        </Box>
        <Box>
          <Text>Press </Text>
          <Text bold color="yellow">
            Enter
          </Text>
          <Text> to apply, </Text>
          <Text bold color="yellow">
            b
          </Text>
          <Text> to go back, </Text>
          <Text bold color="yellow">
            Esc/q
          </Text>
          <Text> to cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
