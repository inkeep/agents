import { Box, Text } from 'ink';

interface HelpBarProps {
  phase: 'resolving' | 'summary';
}

function Key({ label, action }: { label: string; action: string }) {
  return (
    <Box marginRight={2}>
      <Text bold color="yellow">
        {label}
      </Text>
      <Text dimColor> {action}</Text>
    </Box>
  );
}

export function HelpBar({ phase }: HelpBarProps) {
  if (phase === 'summary') {
    return (
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Key label="Enter" action="confirm" />
        <Key label="p" action="back" />
        <Key label="Esc/q" action="cancel" />
      </Box>
    );
  }

  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Key label="↑↓/jk" action="navigate" />
      <Key label="←/1" action="ours" />
      <Key label="→/2" action="theirs" />
      <Key label="Enter/n" action="next" />
      <Key label="p" action="prev" />
      <Key label="Esc/q" action="cancel" />
    </Box>
  );
}
