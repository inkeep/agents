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
import { Badge } from '@/components/ui/badge';
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
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { useDeleteNode } from '@/hooks/use-delete-node';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';
import { useProjectPermissionsQuery, useProjectQuery } from '@/lib/query/projects';
import { createLookup, isRequired } from '@/lib/utils';
import type { AgentNodeData } from '../../configuration/node-types';
import { SectionHeader } from '../section';
import { ComponentSelector } from './component-selector/component-selector';
import { ModelSection } from './model-section';

const executionLimitInheritanceInfo = (
  <ul className="space-y-1.5 list-disc list-outside pl-4">
    <li>
      <b>stepCountIs</b>: Project → Agent only (sub agent-level execution limit)
    </li>
    <li>
      <b>Explicit settings</b> always take precedence over inherited values
    </li>
    <li>
      <b>Agent scope</b>: This limit applies only to this specific sub agent's execution steps
    </li>
    <li>
      <b>Independent from transfers</b>: Steps are counted per sub agent, transfers are counted per
      conversation
    </li>
  </ul>
);

interface SubAgentNodeEditorProps {
  selectedNode: Pick<Node<AgentNodeData>, 'id' | 'data'>;
}

export const SubAgentNodeEditor: FC<SubAgentNodeEditorProps> = ({ selectedNode }) => {
  const form = useFullAgentFormContext();
  const nodeId = selectedNode.id;
  const subAgent = useWatch({ control: form.control, name: `subAgents.${nodeId}` });
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const { data: project } = useProjectQuery();
  const { data: artifactComponents } = useArtifactComponentsQuery();
  const { data: dataComponents } = useDataComponentsQuery();
  const models = useWatch({ control: form.control, name: 'models' });
  const defaultSubAgentNodeId = useWatch({
    control: form.control,
    name: 'defaultSubAgentNodeId',
  });
  const path = <K extends string>(key: K) => `subAgents.${nodeId}.${key}` as const;
  const { deleteNode } = useDeleteNode(nodeId);
  const isPersistedSubAgent =
    form.formState.defaultValues?.subAgents?.[selectedNode.id] !== undefined;
  const nameField = path('name');
  const idField = path('id');

  useAutoPrefillId({
    form,
    nameField,
    idField,
    isEditing: isPersistedSubAgent,
  });

  if (!subAgent) {
    return null;
  }

  const artifactComponentsById = createLookup(artifactComponents);
  const dataComponentsById = createLookup(dataComponents);
  const isDefault = nodeId === defaultSubAgentNodeId;

  return (
    <div className="space-y-8 flex flex-col">
      <GenericInput
        control={form.control}
        name={nameField}
        label="Name"
        placeholder="Support agent"
        isRequired={isRequired(FullAgentSubAgentSchema, 'name')}
      />
      <GenericInput
        control={form.control}
        name={idField}
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
      <FormField
        control={form.control}
        name={path('skills')}
        render={({ field }) => {
          const value = field.value ?? [];
          return (
            <FormItem>
              <div className="flex gap-1">
                <FormLabel>Skill Configuration</FormLabel>
                <Badge variant="count">{value.length}</Badge>
              </div>
              <SkillSelector selectedSkills={value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          );
        }}
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
        name="defaultSubAgentNodeId"
        render={({ field }) => (
          <FormItem>
            <div className="flex gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value === nodeId}
                  onCheckedChange={() => {
                    const newDefaultId = field.value === nodeId ? null : nodeId;
                    form.setValue('defaultSubAgentNodeId', newDefaultId, {
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
      <FormField
        control={form.control}
        name={path('models')}
        render={({ field: _field }) => (
          <FormItem>
            <ModelSection
              // field.value doesn't update properly here, so we read from subAgent.models instead
              models={subAgent.models}
              updatePath={(fieldPath, value) => {
                form.setValue(path(fieldPath), value, { shouldDirty: true });
              }}
              projectModels={project?.models}
              agentModels={models}
            />
            <FormMessage />
          </FormItem>
        )}
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
              {executionLimitInheritanceInfo}
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
      <FormField
        control={form.control}
        name={path('dataComponents')}
        render={({ field }) => {
          const value = field.value ?? [];
          return (
            <FormItem>
              <div className="flex gap-1">
                <FormLabel>Components</FormLabel>
                <Badge variant="count">{value.length}</Badge>
              </div>
              <ComponentSelector
                componentLookup={dataComponentsById}
                selectedComponents={value}
                onSelectionChange={field.onChange}
                emptyStateMessage="No components found."
                emptyStateActionText="Create component"
                emptyStateActionHref={`/${tenantId}/projects/${projectId}/components/new`}
                placeholder="Select components..."
              />
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name={path('artifactComponents')}
        render={({ field }) => {
          const value = field.value ?? [];
          return (
            <FormItem>
              <div className="flex gap-1">
                <FormLabel>Artifacts</FormLabel>
                <Badge variant="count">{value.length}</Badge>
              </div>
              <ComponentSelector
                componentLookup={artifactComponentsById}
                selectedComponents={value}
                onSelectionChange={field.onChange}
                emptyStateMessage="No artifacts found."
                emptyStateActionText="Create artifact"
                emptyStateActionHref={`/${tenantId}/projects/${projectId}/artifacts/new`}
                placeholder="Select artifacts..."
                commandInputPlaceholder="Search artifacts..."
              />
              <FormMessage />
            </FormItem>
          );
        }}
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
