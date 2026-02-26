import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { useWatch } from 'react-hook-form';
import { GenericCheckbox } from '@/components/form/generic-checkbox';
import { GenericInput } from '@/components/form/generic-input';
import { GenericPromptEditor } from '@/components/form/generic-prompt-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { SkillSelector } from '@/components/skills/skill-selector';
import { Button } from '@/components/ui/button';
import {
  getExecutionLimitInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useDeleteNode } from '@/hooks/use-delete-node';
import { useProjectData } from '@/hooks/use-project-data';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import type { DataComponent } from '@/lib/api/data-components';
import type { AgentNodeData } from '../../configuration/node-types';
import { SectionHeader } from '../section';
import { ComponentSelector } from './component-selector/component-selector';
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
}

export const SubAgentNodeEditor: FC<SubAgentNodeEditorProps> = ({
  selectedNode,
  dataComponentLookup,
  artifactComponentLookup,
}) => {
  'use memo';
  const form = useFullAgentFormContext();
  const id = selectedNode.data.id ?? selectedNode.id;
  const subAgent = useWatch({ control: form.control, name: `subAgents.${id}` });

  const path = <K extends string>(k: K) => `subAgents.${id}.${k}` as const;

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { canEdit } = useProjectPermissions();
  const selectedDataComponents = subAgent.dataComponents;
  const selectedArtifactComponents = subAgent.artifactComponents;
  const { project } = useProjectData();
  const models = useWatch({ control: form.control, name: 'models' });

  const { deleteNode } = useDeleteNode(selectedNode.id);

  // useEffect(() => {
  //   form.setError(path('stopWhen.stepCountIs'), {
  //     type: 'manual',
  //     message: 'This field is invalid',
  //   });
  // }, []);
  console.log({ subAgent });
  if (!subAgent) {
    return;
  }
  return (
    <div className="space-y-8 flex flex-col">
      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="Support agent"
        isRequired
      />
      <GenericInput
        control={form.control}
        name={path('id')}
        label="Id"
        placeholder="my-agent"
        description="Choose a unique identifier for this sub agent. Using an existing id will replace that sub agent."
        isRequired
      />
      <GenericTextarea
        control={form.control}
        name={path('description')}
        label="Description"
        placeholder="This sub agent is responsible for..."
      />
      <SkillSelector
        // @ts-expect-error -- fixme
        selectedSkills={subAgent.skills}
        onChange={(value) => form.setValue(path('skills'), value)}
        // TODO
        // error={getFieldError('skills')}
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
        models={subAgent.models}
        updatePath={(path, value) => {
          form.setValue(path as any, value, { shouldDirty: true });
        }}
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
        <GenericInput
          control={form.control}
          name={path('stopWhen.stepCountIs')}
          type="number"
          placeholder="50"
          label={
            <div className="flex items-center gap-2">
              <Label htmlFor="step-count">Max steps</Label>
              <InheritanceIndicator
                {...getExecutionLimitInheritanceStatus(
                  'agent',
                  'stepCountIs',
                  subAgent.stopWhen?.stepCountIs,
                  project?.stopWhen?.stepCountIs
                )}
                size="sm"
              />
            </div>
          }
          description="Maximum number of execution steps for this sub agent (defaults to 50 if not set)"
        />
      </div>
      <Separator />
      <ComponentSelector
        label="Components"
        componentLookup={dataComponentLookup}
        selectedComponents={selectedDataComponents}
        onSelectionChange={(newSelection) => {
          form.setValue(path('dataComponents'), newSelection, { shouldDirty: true });
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
          form.setValue(path('artifactComponents'), newSelection, { shouldDirty: true });
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
