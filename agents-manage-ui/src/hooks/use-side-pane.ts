import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const PANE_TYPES = ['agent', 'node', 'edge'] as const;

export function useSidePane() {
  const [{ pane, nodeId, edgeId }, setQueryState] = useQueryStates({
    pane: parseAsStringLiteral(PANE_TYPES),
    nodeId: parseAsString,
    edgeId: parseAsString,
  });

  return {
    pane,
    nodeId,
    edgeId,
    isOpen: Boolean(pane),
    setQueryState,
    openAgentPane: () => setQueryState({ pane: 'agent', nodeId: null, edgeId: null }),
  };
}
