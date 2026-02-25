import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { SkillSelector } from '@/components/skills/skill-selector';
import { Button } from '@/components/ui/button';
import {
  getExecutionLimitInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import type { ErrorHelpers } from '@/hooks/use-agent-errors';
import { useNodeEditor } from '@/hooks/use-node-editor';
import { useProjectData } from '@/hooks/use-project-data';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { AgentNodeData } from '../../configuration/node-types';
import { SectionHeader } from '../section';
import { ComponentSelector } from './component-selector/component-selector';
import { ModelSection } from './model-section';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { GenericPromptEditor } from '@/components/form/generic-prompt-editor';
import { GenericCheckbox } from '@/components/form/generic-checkbox';

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

export const SubAgentNodeEditor: FC<SubAgentNodeEditorProps> = ({
  selectedNode,
  dataComponentLookup,
  artifactComponentLookup,
  errorHelpers,
}) => {
  'use memo';
  const form = useFullAgentFormContext();
  const { fields } = useFieldArray({
    control: form.control,
    name: 'subAgents',
    keyName: '_rhfKey',
  });
  const subAgentIndex = fields.findIndex((s) => s.id === (selectedNode.data.id ?? selectedNode.id));
  const subAgent = useWatch({ control: form.control, name: `subAgents.${subAgentIndex}` });
  // if (subAgentIndex < 0) return null;

  const path = <K extends string>(k: K) => `subAgents.${subAgentIndex}.${k}` as const;
  console.log(subAgent);

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { canEdit } = useProjectPermissions();
  const selectedDataComponents = subAgent.dataComponents;
  const selectedArtifactComponents = subAgent.artifactComponents;
  const { project } = useProjectData();
  const models = useWatch({ control: form.control, name: 'models' });

  const { updatePath, updateNestedPath, getFieldError, deleteNode } = useNodeEditor({
    selectedNodeId: selectedNode.id,
    errorHelpers,
  });

  const updateModelPath = (path: string, value: any) => {
    updateNestedPath(path, value, selectedNode.data);
  };
  // useEffect(() => {
  //   form.setError(`subAgents.${subAgentIndex}.isDefault`, {
  //     type: 'manual',
  //     message: 'This field is invalid',
  //   });
  // }, []);
  return (
    <div className="space-y-8 flex flex-col">
      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="Support agent"
      />
      <GenericInput
        control={form.control}
        name={path('id')}
        label="Id"
        placeholder="my-agent"
        description="Choose a unique identifier for this sub agent. Using an existing id will replace that sub agent."
      />
      <GenericTextarea
        control={form.control}
        name={path('description')}
        label="Description"
        placeholder="This sub agent is responsible for..."
      />
      <SkillSelector
        selectedSkills={selectedNode.data.skills}
        onChange={(value) => updatePath('skills', value)}
        error={getFieldError('skills')}
      />
      <GenericPromptEditor
        control={form.control}
        name={path('prompt')}
        label="Prompt"
        placeholder="You are a helpful assistant..."
      />
      <GenericCheckbox
        control={form.control}
        name={path('isDefault')}
        label="Is default sub agent"
        description="The default sub agent is the initial entry point for conversations."
      />
      <Separator />
      <ModelSection
        models={selectedNode.data.models}
        updatePath={updateModelPath}
        projectModels={project?.models}
        agentModels={models}
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
        commandInputPlaceholder="Search artifacts..."
      />
      {!subAgent.isDefault && canEdit && (
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
};
