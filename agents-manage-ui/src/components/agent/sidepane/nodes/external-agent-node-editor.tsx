import type { Node } from '@xyflow/react';
import { useCallback } from 'react';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { useAutoPrefillIdZustand } from '@/hooks/use-auto-prefill-id-zustand';
import type { ErrorHelpers } from '@/hooks/use-agent-errors';
import { useNodeEditor } from '@/hooks/use-node-editor';
import type { Credential } from '@/lib/api/credentials';
import type { ExternalAgentNodeData } from '../../configuration/node-types';
import { CredentialSelector } from './credential-selector';
import { InputField, TextareaField } from './form-fields';

interface ExternalAgentNodeEditorProps {
  selectedNode: Node<ExternalAgentNodeData>;
  credentialLookup: Record<string, Credential>;
  errorHelpers?: ErrorHelpers;
}

export function ExternalAgentNodeEditor({
  selectedNode,
  credentialLookup,
  errorHelpers,
}: ExternalAgentNodeEditorProps) {
  const { handleInputChange, getFieldError, setFieldRef, updateField } = useNodeEditor({
    selectedNodeId: selectedNode.id,
    errorHelpers,
  });

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

  return (
    <div className="space-y-8 flex flex-col">
      <p className="text-sm text-muted-foreground">
        External agents are agents external to a agent that can communicate using the A2A
        (Agent-to-Agent) protocol. External agents enable you to delegate tasks between agent
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
      />
      <ExpandableJsonEditor
        name="headers"
        label="Headers"
        value={selectedNode.data.headers}
        onChange={(value) => updateField('headers', value)}
        placeholder="{}"
        className=""
      />
      <CredentialSelector
        label="Credential"
        credentialLookup={credentialLookup}
        value={
          typeof selectedNode.data.credentialReferenceId === 'string'
            ? selectedNode.data.credentialReferenceId
            : null
        }
        onValueChange={(value) => updateField('credentialReferenceId', value || '')}
        placeholder="Select a credential"
      />
    </div>
  );
}
