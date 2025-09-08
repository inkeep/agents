import type { Node } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ErrorHelpers } from '@/hooks/use-graph-errors';
import { useNodeEditor } from '@/hooks/use-node-editor';
import { useProjectData } from '@/hooks/use-project-data';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  InheritanceIndicator,
  getExecutionLimitInheritanceStatus,
} from '@/components/ui/inheritance-indicator';
import type { AgentNodeData } from '../../configuration/node-types';
import { ComponentSelector } from './component-selector/component-selector';
import { ExpandableTextArea } from './expandable-text-area';
import { InputField, TextareaField } from './form-fields';
import { ModelSection } from './model-section';

interface AgentNodeEditorProps {
  selectedNode: Node<AgentNodeData>;
  dataComponentLookup: Record<string, DataComponent>;
  artifactComponentLookup: Record<string, ArtifactComponent>;
  errorHelpers?: ErrorHelpers;
}

export function AgentNodeEditor({
  selectedNode,
  dataComponentLookup,
  artifactComponentLookup,
  errorHelpers,
}: AgentNodeEditorProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const selectedDataComponents = selectedNode.data?.dataComponents || [];
  const selectedArtifactComponents = selectedNode.data?.artifactComponents || [];

  // Get project and graph data for inheritance indicators
  const { project } = useProjectData();
  const metadata = useGraphStore((state) => state.metadata);

  const { updatePath, updateNestedPath, getFieldError, setFieldRef } = useNodeEditor({
    selectedNodeId: selectedNode.id,
    errorHelpers,
  });

  // Create a wrapper function that provides the current node data for nested updates
  const updateModelPath = useCallback(
    (path: string, value: any) => {
      updateNestedPath(path, value, selectedNode.data);
    },
    [updateNestedPath, selectedNode.data]
  );

  return (
    <div className="space-y-8 flex flex-col">
      <InputField
        ref={(el) => setFieldRef('id', el)}
        id="id"
        name="id"
        label="Id"
        value={selectedNode.data.id || ''}
        onChange={(e) => updatePath('id', e.target.value)}
        placeholder="my-agent"
        error={getFieldError('id')}
        description="Choose a unique identifier for this agent. Using an existing id will replace that agent."
      />

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

      <TextareaField
        ref={(el) => setFieldRef('description', el)}
        id="description"
        name="description"
        label="Description"
        value={selectedNode.data.description || ''}
        onChange={(e) => updatePath('description', e.target.value)}
        placeholder="This agent is responsible for..."
        error={getFieldError('description')}
      />

      <div className="space-y-2">
        <ExpandableTextArea
          ref={(el) => setFieldRef('prompt', el)}
          id="prompt"
          name="prompt"
          value={selectedNode.data.prompt || ''}
          onChange={(e) => updatePath('prompt', e.target.value)}
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

      <ModelSection
        models={selectedNode.data.models}
        updatePath={updateModelPath}
        projectModels={project?.models}
        graphModels={metadata?.models}
      />

      {/* Agent Execution Limits */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Execution Limits</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure agent-level execution limits for steps within this agent.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="step-count">Max Steps</Label>
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
            Maximum number of execution steps for this agent (defaults to 50 if not set)
          </p>
        </div>

        <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            How execution limit inheritance works:
          </p>
          <ul className="space-y-1 text-blue-800 dark:text-blue-200">
            <li>
              • <strong>stepCountIs</strong>: Project → Agent only (agent-level execution limit)
            </li>
            <li>
              • <strong>Explicit settings</strong> always take precedence over inherited values
            </li>
            <li>
              • <strong>Agent scope</strong>: This limit applies only to this specific agent's
              execution steps
            </li>
            <li>
              • <strong>Independent from transfers</strong>: Steps are counted per agent, transfers
              are counted per conversation
            </li>
          </ul>
        </div>
      </div>

      <ComponentSelector
        label="Data components"
        componentLookup={dataComponentLookup}
        selectedComponents={selectedDataComponents}
        onSelectionChange={(newSelection) => {
          updatePath('dataComponents', newSelection);
        }}
        emptyStateMessage="No data components found."
        emptyStateActionText="Create data component"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/data-components/new`}
        placeholder="Select data components..."
      />

      <ComponentSelector
        label="Artifact components"
        componentLookup={artifactComponentLookup}
        selectedComponents={selectedArtifactComponents}
        onSelectionChange={(newSelection) => {
          updatePath('artifactComponents', newSelection);
        }}
        emptyStateMessage="No artifact components found."
        emptyStateActionText="Create artifact component"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/artifact-components/new`}
        placeholder="Select artifact components..."
      />
    </div>
  );
}
