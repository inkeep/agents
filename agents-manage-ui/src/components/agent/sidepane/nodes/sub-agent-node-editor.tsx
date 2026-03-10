import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { useWatch } from 'react-hook-form';
import { FullAgentSubAgentSchema } from '@/components/agent/form/validation';
import { GenericInput } from '@/components/form/generic-input';
import { GenericPromptEditor } from '@/components/form/generic-prompt-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { SkillSelector } from '@/components/skills/skill-selector';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  getExecutionLimitInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useDeleteNode } from '@/hooks/use-delete-node';
import { useProjectData } from '@/hooks/use-project-data';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';
import { createLookup, isRequired } from '@/lib/utils';
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
}

export const SubAgentNodeEditor: FC<SubAgentNodeEditorProps> = ({ selectedNode }) => {
  'use memo';
  const form = useFullAgentFormContext();
  const nodeId = selectedNode.id;
  const subAgent = useWatch({ control: form.control, name: `subAgents.${nodeId}` });

  const path = <K extends string>(key: K) => `subAgents.${nodeId}.${key}` as const;

  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { canEdit } = useProjectPermissions();
  const { project } = useProjectData();
  const { data: artifactComponents } = useArtifactComponentsQuery();
  const { data: dataComponents } = useDataComponentsQuery();
  const artifactComponentsById = createLookup(artifactComponents);
  const dataComponentsById = createLookup(dataComponents);
  const models = useWatch({ control: form.control, name: 'models' });
  const defaultSubAgentId = useWatch({ control: form.control, name: 'defaultSubAgentId' });
  const isDefault = nodeId === defaultSubAgentId;

  const { deleteNode } = useDeleteNode(nodeId);

  return (
    <div className="space-y-8 flex flex-col">
      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="Support agent"
        isRequired={isRequired(FullAgentSubAgentSchema, 'name')}
      />
      <GenericInput
        control={form.control}
        name={path('id')}
        label="Id"
        placeholder="my-agent"
        description="Choose a unique identifier for this sub agent. Using an existing id will replace that sub agent."
        isRequired={isRequired(FullAgentSubAgentSchema, 'id')}
      />
      <GenericTextarea
        control={form.control}
        name={path('description')}
        label="Description"
        placeholder="This sub agent is responsible for..."
        isRequired={isRequired(FullAgentSubAgentSchema, 'description')}
      />
      <SkillSelector
        selectedSkills={subAgent.skills ?? []}
        onChange={(value) => form.setValue(path('skills'), value)}
        // TODO
        // error={getFieldError('skills')}
      />
      <GenericPromptEditor
        control={form.control}
        name={path('prompt')}
        label="Prompt"
        placeholder="You are a helpful assistant..."
        isRequired={isRequired(FullAgentSubAgentSchema, 'prompt')}
      />
      <FormField
        control={form.control}
        name="defaultSubAgentId"
        render={({ field }) => (
          <FormItem>
            <div className="flex gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value === nodeId}
                  onCheckedChange={() => {
                    const newDefaultId = field.value === nodeId ? null : nodeId;
                    form.setValue('defaultSubAgentId', newDefaultId, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              </FormControl>
              <FormLabel>Is default sub agent</FormLabel>
            </div>
            <FormDescription>
              The default sub agent is the initial entry point for conversations.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
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
            <>
              Max steps
              <InheritanceIndicator
                {...getExecutionLimitInheritanceStatus(
                  'agent',
                  'stepCountIs',
                  subAgent.stopWhen?.stepCountIs,
                  project?.stopWhen?.stepCountIs
                )}
                size="sm"
              />
            </>
          }
          description="Maximum number of execution steps for this sub agent (defaults to 50 if not set)"
          isRequired={isRequired(FullAgentSubAgentSchema, 'stopWhen.stepCountIs')}
        />
      </div>
      <Separator />
      <ComponentSelector
        label="Components"
        componentLookup={dataComponentsById}
        // @ts-expect-error -- fixme
        selectedComponents={subAgent.dataComponents}
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
        componentLookup={artifactComponentsById}
        // @ts-expect-error -- fixme
        selectedComponents={subAgent.artifactComponents}
        onSelectionChange={(newSelection) => {
          form.setValue(path('artifactComponents'), newSelection, { shouldDirty: true });
        }}
        emptyStateMessage="No artifacts found."
        emptyStateActionText="Create artifact"
        emptyStateActionHref={`/${tenantId}/projects/${projectId}/artifacts/new`}
        placeholder="Select artifacts..."
        commandInputPlaceholder="Search artifacts..."
      />
      {!isDefault && canEdit && (
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
