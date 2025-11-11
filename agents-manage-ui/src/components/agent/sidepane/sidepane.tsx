import type { Edge, Node } from '@xyflow/react';
import { useEdges, useNodesData } from '@xyflow/react';
import { type LucideIcon, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { Credential } from '@/lib/api/credentials';
import type { DataComponent } from '@/lib/api/data-components';
import { cn } from '@/lib/utils';
import { SidePane as SidePaneLayout } from '../../layout/sidepane';
import type {
  AgentToolConfigLookup,
  SubAgentExternalAgentConfigLookup,
  SubAgentTeamAgentConfigLookup,
} from '../agent';
import { edgeTypeMap } from '../configuration/edge-types';
import {
  type AgentNodeData,
  type ExternalAgentNodeData,
  type FunctionToolNodeData,
  type MCPNodeData,
  NodeType,
  nodeTypeMap,
  type TeamAgentNodeData,
} from '../configuration/node-types';
import EdgeEditor from './edges/edge-editor';
import { EditorLoadingSkeleton } from './editor-loading-skeleton';
import { Heading } from './heading';
import MetadataEditor from './metadata/metadata-editor';
import { ExternalAgentNodeEditor } from './nodes/external-agent-node-editor';
import { ExternalAgentSelector } from './nodes/external-agent-selector/external-agent-selector';
import { FunctionToolNodeEditor } from './nodes/function-tool-node-editor';
import { MCPServerNodeEditor } from './nodes/mcp-node-editor';
import { MCPSelector } from './nodes/mcp-selector/mcp-selector';
import { SubAgentNodeEditor } from './nodes/sub-agent-node-editor';
import { TeamAgentNodeEditor } from './nodes/team-agent-node-editor';
import { TeamAgentSelector } from './nodes/team-agent-selector/team-agent-selector';

interface SidePaneProps {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onClose: () => void;
  backToAgent: () => void;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  agentToolConfigLookup: AgentToolConfigLookup;
  subAgentExternalAgentConfigLookup: SubAgentExternalAgentConfigLookup;
  subAgentTeamAgentConfigLookup: SubAgentTeamAgentConfigLookup;
  credentialLookup: Record<string, Credential>;
}

export function SidePane({
  selectedNodeId,
  selectedEdgeId,
  onClose,
  backToAgent,
  dataComponentLookup,
  artifactComponentLookup,
  agentToolConfigLookup,
  subAgentExternalAgentConfigLookup,
  subAgentTeamAgentConfigLookup,
  credentialLookup,
}: SidePaneProps) {
  const selectedNode = useNodesData(selectedNodeId || '');
  const edges = useEdges();
  const { hasFieldError, getFieldErrorMessage, getFirstErrorField } = useAgentErrors();
  const errors = useAgentStore((state) => state.errors);

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : null),
    [selectedEdgeId, edges]
  );

  const { heading, HeadingIcon } = useMemo(() => {
    let heading = '';
    let HeadingIcon: LucideIcon | undefined;

    if (selectedNodeId) {
      const nodeType = (selectedNode?.type as keyof typeof nodeTypeMap) || NodeType.SubAgent;
      const nodeConfig = nodeTypeMap[nodeType];
      heading = nodeConfig?.name || 'Node';
      HeadingIcon = nodeConfig?.Icon;
    } else if (selectedEdgeId) {
      const edgeType = (selectedEdge?.type as keyof typeof edgeTypeMap) || 'default';
      const edgeConfig = edgeTypeMap[edgeType];
      heading = edgeConfig?.name || 'Connection';
      HeadingIcon = edgeConfig?.Icon;
    } else {
      heading = 'Agent';
      HeadingIcon = Workflow;
    }

    return { heading, HeadingIcon };
  }, [selectedNode, selectedEdge, selectedNodeId, selectedEdgeId]);

  const editorContent = useMemo(() => {
    if (selectedNodeId && !selectedNode) {
      return <EditorLoadingSkeleton />;
    }
    if (selectedEdgeId && !selectedEdge) {
      return <EditorLoadingSkeleton />;
    }

    if (selectedNode) {
      const nodeType = selectedNode?.type as keyof typeof nodeTypeMap;
      // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
      const subAgentId = (selectedNode.data as any)?.id || selectedNode.id;
      const errorHelpers = {
        hasFieldError: (fieldName: string) => hasFieldError(subAgentId, fieldName),
        getFieldErrorMessage: (fieldName: string) => getFieldErrorMessage(subAgentId, fieldName),
        getFirstErrorField: () => getFirstErrorField(subAgentId),
      };

      switch (nodeType) {
        case NodeType.SubAgent:
          return (
            <SubAgentNodeEditor
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
              credentialLookup={credentialLookup}
              subAgentExternalAgentConfigLookup={subAgentExternalAgentConfigLookup}
              errorHelpers={errorHelpers}
            />
          );
        }
        case NodeType.ExternalAgentPlaceholder: {
          return <ExternalAgentSelector selectedNode={selectedNode as Node} />;
        }
        case NodeType.TeamAgent: {
          return (
            <TeamAgentNodeEditor
              selectedNode={selectedNode as Node<TeamAgentNodeData>}
              subAgentTeamAgentConfigLookup={subAgentTeamAgentConfigLookup}
              errorHelpers={errorHelpers}
            />
          );
        }
        case NodeType.TeamAgentPlaceholder: {
          return <TeamAgentSelector selectedNode={selectedNode as Node} />;
        }
        case NodeType.MCPPlaceholder: {
          return <MCPSelector selectedNode={selectedNode as Node} />;
        }
        case NodeType.MCP: {
          return (
            <MCPServerNodeEditor
              selectedNode={selectedNode as Node<MCPNodeData>}
              agentToolConfigLookup={agentToolConfigLookup}
            />
          );
        }
        case NodeType.FunctionTool: {
          return (
            <FunctionToolNodeEditor selectedNode={selectedNode as Node<FunctionToolNodeData>} />
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
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedEdge,
    dataComponentLookup,
    artifactComponentLookup,
    hasFieldError,
    getFieldErrorMessage,
    getFirstErrorField,
    agentToolConfigLookup,
    credentialLookup,
    subAgentExternalAgentConfigLookup,
    subAgentTeamAgentConfigLookup,
    // Rerender sidepane when errors changes
    errors,
  ]);

  const showBackButton = selectedNode || selectedEdge;

  return (
    <SidePaneLayout.Root>
      <SidePaneLayout.Header>
        <div className="flex items-center relative">
          {showBackButton && <SidePaneLayout.BackButton onClick={backToAgent} />}
          <Heading
            heading={heading}
            Icon={HeadingIcon}
            className={cn(
              showBackButton && 'transition-all duration-300 ease-in-out group-hover:translate-x-8'
            )}
          />
        </div>
        <SidePaneLayout.CloseButton onClick={onClose} />
      </SidePaneLayout.Header>
      <SidePaneLayout.Content>{editorContent}</SidePaneLayout.Content>
    </SidePaneLayout.Root>
  );
}
