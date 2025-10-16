import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

export const PANE_TYPES = ['agent', 'node', 'edge'] as const;
export type PaneType = (typeof PANE_TYPES)[number];

export const DEFAULT_NEW_AGENT_PANE: PaneType = 'agent';

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
