import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getExecutionLimitInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import type { ErrorHelpers } from '@/hooks/use-agent-errors';
import { useAutoPrefillIdZustand } from '@/hooks/use-auto-prefill-id-zustand';
import { useNodeEditor } from '@/hooks/use-node-editor';
import { useProjectData } from '@/hooks/use-project-data';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { AgentNodeData } from '../../configuration/node-types';
import { SectionHeader } from '../section';
import { ComponentSelector } from './component-selector/component-selector';
import { ExpandableTextArea } from './expandable-text-area';
import { InputField, TextareaField } from './form-fields';
import { ModelSection } from './model-section';

const ExecutionLimitInheritanceInfo = () => {
  return (
    <ul className="space-y-1.5 list-disc list-outside pl-4">
      <li>
        <span className="font-medium">stepCountIs</span>: Project → Agent only (sub agent-level
        execution limit)
      </li>
      <li>
        <span className="font-medium">Explicit settings</span> always take precedence over inherited
        values
      </li>
      <li>
        <span className="font-medium">Agent scope</span>: This limit applies only to this specific
        sub agent's execution steps
      </li>
      <li>
        <span className="font-medium">Independent from transfers</span>: Steps are counted per sub
        agent, transfers are counted per conversation
      </li>
    </ul>
  );
};

interface SubAgentNodeEditorProps {
  selectedNode: Node<AgentNodeData>;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  errorHelpers?: ErrorHelpers;
}

export function SubAgentNodeEditor({
  selectedNode,
  dataComponentLookup,
  artifactComponentLookup,
  errorHelpers,
}: SubAgentNodeEditorProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const selectedDataComponents = selectedNode.data?.dataComponents || [];
  const selectedArtifactComponents = selectedNode.data?.artifactComponents || [];
  const isDefaultSubAgent = selectedNode.data?.isDefault || false;

  const { project } = useProjectData();
  const metadata = useAgentStore((state) => state.metadata);

  const {
    updatePath,
    updateNestedPath,
    getFieldError,
    setFieldRef,
    updateDefaultSubAgent,
    deleteNode,
  } = useNodeEditor({
    selectedNodeId: selectedNode.id,
    errorHelpers,
  });

  const updateModelPath = useCallback(
    (path: string, value: any) => {
      updateNestedPath(path, value, selectedNode.data);
    },
    [updateNestedPath, selectedNode.data]
  );

  const handleIdChange = useCallback(
    (generatedId: string) => {
      updatePath('id', generatedId);
    },
    [updatePath]
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
      <InputField
        ref={(el) => setFieldRef('name', el)}
        id="name"
        name="name"
        label="Name"
        value={selectedNode.data.name || ''}
        onChange={(e) => updatePath('name', e.target.value)}
        placeholder="Support agent"
        error={getFieldError('name')}
        isRequired
      />
      <InputField
        ref={(el) => setFieldRef('id', el)}
        id="id"
        name="id"
        label="Id"
        value={selectedNode.data.id || ''}
        onChange={(e) => updatePath('id', e.target.value)}
        placeholder="my-agent"
        error={getFieldError('id')}
        description="Choose a unique identifier for this sub agent. Using an existing id will replace that sub agent."
        isRequired
      />
      <TextareaField
        ref={(el) => setFieldRef('description', el)}
        id="description"
        name="description"
        label="Description"
        value={selectedNode.data.description || ''}
        onChange={(e) => updatePath('description', e.target.value)}
        placeholder="This sub agent is responsible for..."
        error={getFieldError('description')}
      />

      <div className="space-y-2">
        <ExpandableTextArea
          id="prompt"
          value={selectedNode.data.prompt || ''}
          onChange={(value) => updatePath('prompt', value)}
          placeholder="You are a helpful assistant..."
          data-invalid={errorHelpers?.hasFieldError('prompt') ? '' : undefined}
          className="w-full max-h-96 data-invalid:border-red-300 data-invalid:focus-visible:border-red-300 data-invalid:focus-visible:ring-red-300"
          label="Prompt"
          isRequired
        />
        {getFieldError('prompt') && (
          <p className="text-sm text-red-600">{getFieldError('prompt')}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is-default-sub-agent"
            checked={isDefaultSubAgent}
            onCheckedChange={(checked) => {
              updateDefaultSubAgent(checked === true);
            }}
          />
          <Label htmlFor="is-default-sub-agent">Is default sub agent</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          The default sub agent is the initial entry point for conversations.
        </p>
      </div>
      <Separator />
      <ModelSection
        models={selectedNode.data.models}
        updatePath={updateModelPath}
        projectModels={project?.models}
        agentModels={metadata?.models}
      />
      <Separator />
      {/* Agent Execution Limits */}
      <div className="space-y-8">
        <SectionHeader
          title="Execution limits"
          description="Configure sub agent-level execution limits for steps within this sub agent."
          titleTooltip={
            <div>
              <p>How execution limit inheritance works:</p>
              <ExecutionLimitInheritanceInfo />
            </div>
          }
        />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="step-count">Max steps</Label>
            <InheritanceIndicator
              {...getExecutionLimitInheritanceStatus(
                'agent',
                'stepCountIs',
                selectedNode.data.stopWhen?.stepCountIs,
                project?.stopWhen?.stepCountIs
              )}
              size="sm"
            />
          </div>
          <Input
            id="step-count"
            type="number"
            min="1"
            max="1000"
            value={selectedNode.data.stopWhen?.stepCountIs || ''}
            onChange={(e) => {
              const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
              updatePath('stopWhen', {
                ...(selectedNode.data.stopWhen || {}),
                stepCountIs: value,
              });
            }}
            placeholder="50"
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of execution steps for this sub agent (defaults to 50 if not set)
          </p>
        </div>
      </div>
      <Separator />
      <ComponentSelector
        label="Components"
        componentLookup={dataComponentLookup}
        selectedComponents={selectedDataComponents}
        onSelectionChange={(newSelection) => {
          updatePath('dataComponents', newSelection);
        }}
        emptyStateMessage="No components found."
        emptyStateActionText="Create component"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/components/new`}
        placeholder="Select components..."
      />

      <ComponentSelector
        label="Artifacts"
        componentLookup={artifactComponentLookup}
        selectedComponents={selectedArtifactComponents}
        onSelectionChange={(newSelection) => {
          updatePath('artifactComponents', newSelection);
        }}
        emptyStateMessage="No artifacts found."
        emptyStateActionText="Create artifact"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/artifacts/new`}
        placeholder="Select artifacts..."
      />
      {!isDefaultSubAgent && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
