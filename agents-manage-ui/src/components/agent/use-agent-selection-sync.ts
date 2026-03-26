import { type Edge, type Node, useOnSelectionChange } from '@xyflow/react';
import { useEffect } from 'react';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import {
  findEdgeByGraphKey,
  findNodeByGraphKey,
  getEdgeGraphKey,
  getNodeGraphKey,
} from '@/features/agent/domain';
import type { useSidePane } from '@/hooks/use-side-pane';

type SetGraphState<T extends Node | Edge> = (updater: (prev: T[]) => T[]) => void;
type SetQueryState = ReturnType<typeof useSidePane>['setQueryState'];

interface UseAgentSelectionSyncParams {
  nodes: Node[];
  edges: Edge[];
  isOpen: boolean;
  nodeId: string | null;
  edgeId: string | null;
  setNodes: SetGraphState<Node>;
  setEdges: SetGraphState<Edge>;
  setQueryState: SetQueryState;
}

export function useAgentSelectionSync({
  nodes,
  edges,
  isOpen,
  nodeId,
  edgeId,
  setNodes,
  setEdges,
  setQueryState,
}: UseAgentSelectionSyncParams) {
  const selectedNode = findNodeByGraphKey(nodes, nodeId);
  const selectedEdge = findEdgeByGraphKey(edges, nodes, edgeId);

  useOnSelectionChange({
    onChange({ nodes: selectedNodes, edges: selectedEdges }) {
      const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
      const edge =
        selectedEdges.length === 1 &&
        (selectedEdges[0]?.type === EdgeType.A2A || selectedEdges[0]?.type === EdgeType.SelfLoop)
          ? selectedEdges[0]
          : null;
      const defaultPane = isOpen ? 'agent' : null;

      setQueryState(
        {
          pane: node ? 'node' : edge ? 'edge' : defaultPane,
          nodeId: node ? getNodeGraphKey(node) : null,
          edgeId: edge ? getEdgeGraphKey(edge, selectedNodes) : null,
        },
        { history: 'replace' }
      );
    },
  });

  useEffect(() => {
    const selectedCanvasNode = nodes.filter((node) => node.selected);
    const selectedCanvasEdge = edges.filter((edge) => edge.selected);
    const singleSelectedNode = selectedCanvasNode.length === 1 ? selectedCanvasNode[0] : null;
    const singleSelectedEdge = selectedCanvasEdge.length === 1 ? selectedCanvasEdge[0] : null;

    if (singleSelectedNode) {
      const nextNodeId = getNodeGraphKey(singleSelectedNode);
      if (nextNodeId && nextNodeId !== nodeId) {
        setQueryState(
          {
            pane: 'node',
            nodeId: nextNodeId,
            edgeId: null,
          },
          { history: 'replace' }
        );
      }
      return;
    }

    if (
      singleSelectedEdge &&
      (singleSelectedEdge.type === EdgeType.A2A || singleSelectedEdge.type === EdgeType.SelfLoop)
    ) {
      const nextEdgeId = getEdgeGraphKey(singleSelectedEdge, nodes);
      if (nextEdgeId && nextEdgeId !== edgeId) {
        setQueryState(
          {
            pane: 'edge',
            nodeId: null,
            edgeId: nextEdgeId,
          },
          { history: 'replace' }
        );
      }
    }
  }, [edgeId, nodeId, nodes, edges, setQueryState]);

  function clearCanvasSelection() {
    setEdges((prevEdges) => prevEdges.map((edge) => ({ ...edge, selected: false })));
    setNodes((prevNodes) => prevNodes.map((node) => ({ ...node, selected: false })));
  }

  function closeSidePane() {
    clearCanvasSelection();
    setQueryState({
      pane: null,
      nodeId: null,
      edgeId: null,
    });
  }

  function backToAgent() {
    clearCanvasSelection();
    setQueryState({
      pane: 'agent',
      nodeId: null,
      edgeId: null,
    });
  }

  return {
    selectedNode,
    selectedEdge,
    closeSidePane,
    backToAgent,
  };
}
