import { type Node, useReactFlow } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Separator } from '@/components/ui/separator';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import type { ErrorHelpers } from '@/hooks/use-agent-errors';
import { useAutoPrefillIdZustand } from '@/hooks/use-auto-prefill-id-zustand';
import { useNodeEditor } from '@/hooks/use-node-editor';
import type { Credential } from '@/lib/api/credentials';
import { getCurrentHeadersForExternalAgentNode } from '@/lib/utils/external-agent-utils';
import type { SubAgentExternalAgentConfigLookup } from '../../agent';
import type { ExternalAgentNodeData } from '../../configuration/node-types';
import { InputField } from '../form-components/input';
import { TextareaField } from '../form-components/text-area';

interface ExternalAgentNodeEditorProps {
  selectedNode: Node<ExternalAgentNodeData>;
  credentialLookup: Record<string, Credential>;
  subAgentExternalAgentConfigLookup: SubAgentExternalAgentConfigLookup;
  errorHelpers?: ErrorHelpers;
}

export function ExternalAgentNodeEditor({
  selectedNode,
  subAgentExternalAgentConfigLookup,
  errorHelpers,
}: ExternalAgentNodeEditorProps) {
  const { updateNodeData } = useReactFlow();
  const { markUnsaved } = useAgentActions();
  const { handleInputChange, getFieldError, setFieldRef, updateField, deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
    errorHelpers,
  });
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const handleHeadersChange = (value: string) => {
    // Always update the input state (allows user to type invalid JSON)
    setHeadersInputValue(value);

    // Only save to node data if the JSON is valid
    try {
      const parsedHeaders = value.trim() === '' ? {} : JSON.parse(value);
      if (
        typeof parsedHeaders === 'object' &&
        parsedHeaders !== null &&
        !Array.isArray(parsedHeaders)
      ) {
        // Valid format - save to node data
        updateNodeData(selectedNode.id, {
          ...selectedNode.data,
          tempHeaders: parsedHeaders,
        });
        markUnsaved();
      }
    } catch {
      // Invalid JSON - don't save, but allow user to continue typing
      // The ExpandableJsonEditor will show the validation error
    }
  };

  const { edges } = useAgentStore((state) => ({
    edges: state.edges,
  }));

  const handleIdChange = useCallback(
    (generatedId: string) => {
      updateField('id', generatedId);
    },
    [updateField]
  );

  // Auto-prefill ID based on name field (always enabled for agent nodes)
  useAutoPrefillIdZustand({
    nameValue: selectedNode.data.name,
    idValue: selectedNode.data.id,
    onIdChange: handleIdChange,
    isEditing: false,
  });

  const getCurrentHeaders = useCallback((): Record<string, string> => {
    return getCurrentHeadersForExternalAgentNode(
      selectedNode,
      subAgentExternalAgentConfigLookup,
      edges
    );
  }, [selectedNode, subAgentExternalAgentConfigLookup, edges]);

  // Local state for headers input (allows invalid JSON while typing)
  const [headersInputValue, setHeadersInputValue] = useState('{}');

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const newHeaders = getCurrentHeaders();
    setHeadersInputValue(JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  return (
    <div className="space-y-8 flex flex-col">
      <p className="text-sm text-muted-foreground">
        External agents are agents that live outside of your project that can communicate using the
        A2A (Agent-to-Agent) protocol. External agents enable you to delegate tasks between agents
        within the agent framework or to third-party services.
      </p>

      <InputField
        ref={(el) => setFieldRef('name', el)}
        id="name"
        name="name"
        label="Name"
        value={selectedNode.data.name || ''}
        onChange={handleInputChange}
        placeholder="Support agent"
        disabled
        error={getFieldError('name')}
      />

      <InputField
        ref={(el) => setFieldRef('id', el)}
        id="id"
        name="id"
        label="Id"
        value={selectedNode.data.id || ''}
        onChange={handleInputChange}
        placeholder="my-external-agent"
        error={getFieldError('id')}
        disabled
        description="Choose a unique identifier for this agent. Using an existing id will replace that agent."
        isRequired
      />

      <TextareaField
        ref={(el) => setFieldRef('description', el)}
        id="description"
        name="description"
        label="Description"
        value={selectedNode.data.description || ''}
        onChange={handleInputChange}
        placeholder="This agent is responsible for..."
        error={getFieldError('description')}
        disabled
      />

      <InputField
        ref={(el) => setFieldRef('baseUrl', el)}
        id="baseUrl"
        name="baseUrl"
        label="Host URL"
        value={selectedNode.data.baseUrl || ''}
        onChange={handleInputChange}
        placeholder="https://api.example.com/agent"
        error={getFieldError('baseUrl')}
        tooltip="This URL is used to discover the agent's capabilities and communicate with it using the A2A protocol. For locally hosted agent defined with the agent-framework this would be: http://localhost:3002/tenants/:tenantId/projects/:projectId/agents/:agentId"
        disabled
      />
      <ExpandableJsonEditor
        name="headers"
        label="Headers"
        value={headersInputValue}
        onChange={handleHeadersChange}
        placeholder="{}"
      />
      <ExternalLink
        href={`/${tenantId}/projects/${projectId}/external-agents/${selectedNode.data.id}/edit`}
      >
        Edit External Agent
      </ExternalLink>
      <Separator />
      <div className="flex justify-end">
        <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
