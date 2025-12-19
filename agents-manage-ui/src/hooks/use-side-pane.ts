import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const PANE_TYPES = ['agent', 'node', 'edge'] as const;

export function useSidePane() {
  const [queryState, setQueryState] = useQueryStates({
    pane: parseAsStringLiteral(PANE_TYPES),
    nodeId: parseAsString,
    edgeId: parseAsString,
  });

  return {
    pane: queryState.pane,
    nodeId: queryState.nodeId,
    edgeId: queryState.edgeId,
    isOpen: Boolean(queryState.pane),
    setQueryState,
    openAgentPane: () => setQueryState({ pane: 'agent', nodeId: null, edgeId: null }),
  };
}
