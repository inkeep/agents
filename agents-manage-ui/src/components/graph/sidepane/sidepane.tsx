import type { Edge, Node } from '@xyflow/react';
import { useEdges, useNodesData } from '@xyflow/react';
import { type LucideIcon, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { useGraphErrors } from '@/hooks/use-graph-errors';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import { SidePane as SidePaneLayout } from '../../layout/sidepane';
import { edgeTypeMap } from '../configuration/edge-types';
import {
  type AgentNodeData,
  type ExternalAgentNodeData,
  type MCPNodeData,
  NodeType,
  nodeTypeMap,
} from '../configuration/node-types';
import EdgeEditor from './edges/edge-editor';
import { Heading } from './heading';
import MetadataEditor from './metadata/metadata-editor';
import { AgentNodeEditor } from './nodes/agent-node-editor';
import { ExternalAgentNodeEditor } from './nodes/external-agent-node-editor';
import { MCPServerNodeEditor } from './nodes/mcp-node-editor';
import { MCPSelector } from './nodes/mcp-selector/mcp-selector';

interface SidePaneProps {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onClose: () => void;
  backToGraph: () => void;
  isOpen: boolean;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  selectedToolsLookup: Record<string, Record<string, string[]>>;
}

export function SidePane({
  selectedNodeId,
  selectedEdgeId,
  onClose,
  backToGraph,
  isOpen,
  dataComponentLookup,
  artifactComponentLookup,
  selectedToolsLookup,
}: SidePaneProps) {
  const selectedNode = useNodesData(selectedNodeId || '');
  const edges = useEdges();
  const { hasFieldError, getFieldErrorMessage, getFirstErrorField } = useGraphErrors();

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : null),
    [selectedEdgeId, edges]
  );

  const { heading, HeadingIcon } = useMemo(() => {
    let heading = '';
    let HeadingIcon: LucideIcon | undefined;

    if (selectedNode) {
      const nodeType = selectedNode?.type as keyof typeof nodeTypeMap;
      const nodeConfig = nodeTypeMap[nodeType];
      heading = nodeConfig?.name || 'Node';
      HeadingIcon = nodeConfig?.Icon;
    } else if (selectedEdge) {
      const edgeType = (selectedEdge?.type as keyof typeof edgeTypeMap) || 'default';
      const edgeConfig = edgeTypeMap[edgeType];
      heading = edgeConfig?.name || 'Connection';
      HeadingIcon = edgeConfig?.Icon;
    } else {
      heading = 'Graph';
      HeadingIcon = Workflow;
    }

    return { heading, HeadingIcon };
  }, [selectedNode, selectedEdge]);

  const editorContent = useMemo(() => {
    if (selectedNode) {
      const nodeType = selectedNode?.type as keyof typeof nodeTypeMap;
      // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
      const agentId = (selectedNode.data as any)?.id || selectedNode.id;
      const errorHelpers = {
        hasFieldError: (fieldName: string) => hasFieldError(agentId, fieldName),
        getFieldErrorMessage: (fieldName: string) => getFieldErrorMessage(agentId, fieldName),
        getFirstErrorField: () => getFirstErrorField(agentId),
      };

      switch (nodeType) {
        case NodeType.Agent:
          return (
            <AgentNodeEditor
              selectedNode={selectedNode as Node<AgentNodeData>}
              dataComponentLookup={dataComponentLookup}
              artifactComponentLookup={artifactComponentLookup}
              errorHelpers={errorHelpers}
            />
          );
        case NodeType.ExternalAgent: {
          return (
            <ExternalAgentNodeEditor
              selectedNode={selectedNode as Node<ExternalAgentNodeData>}
              errorHelpers={errorHelpers}
            />
          );
        }
        case NodeType.MCPPlaceholder: {
          return <MCPSelector selectedNode={selectedNode as Node} />;
        }
        case NodeType.MCP: {
          return (
            <MCPServerNodeEditor
              selectedNode={selectedNode as Node<MCPNodeData>}
              selectedToolsLookup={selectedToolsLookup}
            />
          );
        }
        default:
          return null;
      }
    }
    if (selectedEdge) {
      return <EdgeEditor selectedEdge={selectedEdge as Edge} />;
    }
    return <MetadataEditor />;
  }, [
    selectedNode,
    selectedEdge,
    dataComponentLookup,
    artifactComponentLookup,
    hasFieldError,
    getFieldErrorMessage,
    getFirstErrorField,
    selectedToolsLookup,
  ]);

  const showBackButton = useMemo(() => {
    return selectedNode || selectedEdge;
  }, [selectedNode, selectedEdge]);

  return (
    <SidePaneLayout.Root isOpen={isOpen}>
      {isOpen && (
        <>
          <SidePaneLayout.Header>
            <div className="flex items-center relative">
              {showBackButton && <SidePaneLayout.BackButton onClick={backToGraph} />}
              <Heading
                heading={heading}
                Icon={HeadingIcon}
                className={
                  showBackButton
                    ? 'transition-all duration-300 ease-in-out group-hover:translate-x-8'
                    : ''
                }
              />
            </div>
            <SidePaneLayout.CloseButton onClick={onClose} />
          </SidePaneLayout.Header>
          <SidePaneLayout.Content>{editorContent}</SidePaneLayout.Content>
        </>
      )}
    </SidePaneLayout.Root>
  );
}
