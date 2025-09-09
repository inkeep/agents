import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const paneType = ["graph", "node", "edge"] as const;

export function useSidePane() {
	const [queryState, setQueryState] = useQueryStates({
		pane: parseAsStringLiteral(paneType),
		nodeId: parseAsString,
		edgeId: parseAsString,
	});

	return {
		pane: queryState.pane,
		nodeId: queryState.nodeId,
		edgeId: queryState.edgeId,
		isOpen: Boolean(queryState.pane),
		setQueryState,
		openGraphPane: () =>
			setQueryState({ pane: "graph", nodeId: null, edgeId: null }),
	};
}
