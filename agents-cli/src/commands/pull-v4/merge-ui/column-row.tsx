import { Box, Text } from 'ink';
import type { Side } from './types';
import { formatValue } from './utils';

interface ColumnRowProps {
  columnName: string;
  oursValue: unknown;
  theirsValue: unknown;
  pick: Side;
  isFocused: boolean;
  isLast: boolean;
}

function ValueLine({
  label,
  value,
  isPicked,
}: {
  label: string;
  value: unknown;
  isPicked: boolean;
}) {
  return (
    <Box>
      <Text color={isPicked ? 'green' : undefined} dimColor={!isPicked}>
        {'  '}
        {label} {formatValue(value)}
      </Text>
    </Box>
  );
}

export function ColumnRow({
  columnName,
  oursValue,
  theirsValue,
  pick,
  isFocused,
  isLast,
}: ColumnRowProps) {
  return (
    <Box flexDirection="column" marginBottom={isLast ? 0 : 1}>
      <Box justifyContent="space-between">
        <Box>
          <Text color="cyan">{isFocused ? '▸ ' : '  '}</Text>
          <Text bold={isFocused}>{columnName}</Text>
        </Box>
        <Box>
          <Text dimColor={!isFocused}>pick: </Text>
          <Text bold={isFocused} color={pick === 'ours' ? 'blue' : 'magenta'}>
            {pick}
          </Text>
          {isFocused ? <Text color="green"> ◀</Text> : null}
        </Box>
      </Box>

      <ValueLine label="ours:  " value={oursValue} isPicked={pick === 'ours'} />
      <ValueLine label="theirs:" value={theirsValue} isPicked={pick === 'theirs'} />
    </Box>
  );
}
