'use client';

import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { useWatch } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { ModelInheritanceInfo } from '@/components/projects/form/model-inheritance-info';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { ExternalLink } from '@/components/ui/external-link';
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
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useProjectData } from '@/hooks/use-project-data';
import {
  statusUpdatesComponentsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { FullAgentUpdateSchema as schema } from '@/lib/types/agent-full';
import { isRequired } from '@/lib/utils';
import { GenericPromptEditor } from '../../../form/generic-prompt-editor';
import { CollapsibleSettings } from '../collapsible-settings';
import { InputField } from '../form-components/input';
import { FieldLabel } from '../form-components/label';
import { ModelSelector } from '../nodes/model-selector';
import { SectionHeader } from '../section';
import { ContextConfigForm } from './context-config';

const ExecutionLimitInheritanceInfo = () => {
  return (
    <ul className="space-y-1.5 list-disc list-outside pl-4">
      <li>
        <span className="font-medium">transferCountIs</span>: Project → Agent only (controls
        transfers between sub agents)
      </li>
      <li>
        <span className="font-medium">Explicit settings</span> always take precedence over inherited
        values
      </li>
      <li>
        <span className="font-medium">Default fallback</span>: transferCountIs = 10 if no value is
        set anywhere
      </li>
      <li>
        <span className="font-medium">Agent scope</span>: This limit applies to all sub agents
        within this agent
      </li>
    </ul>
  );
};

export const MetadataEditor: FC = () => {
  'use memo';
  const { agentId, tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { canUse } = useProjectPermissions();
  // Fetch project data for inheritance indicators
  const { project } = useProjectData();
  const form = useFullAgentFormContext();

  const isStatusUpdateEnabled = useWatch({ control: form.control, name: 'statusUpdates.enabled' });
  const numEvents = useWatch({ control: form.control, name: 'statusUpdates.numEvents' });
  const timeInSeconds = useWatch({ control: form.control, name: 'statusUpdates.timeInSeconds' });
  const transferCountIs = useWatch({ control: form.control, name: 'stopWhen.transferCountIs' });
  const models = useWatch({ control: form.control, name: 'models' });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <FieldLabel
          label="Chat URL"
          tooltip="Use this endpoint to chat with your agent or connect it to the Inkeep widget via the agentUrl prop. Supports streaming responses with the Vercel AI SDK data stream protocol."
        />
        <CopyableSingleLineCode code={`${PUBLIC_INKEEP_AGENTS_API_URL}/run/api/chat`} />
        {canUse && (
          <ExternalLink href={`/${tenantId}/projects/${projectId}/api-keys`}>
            Create API key
          </ExternalLink>
        )}
      </div>
      <GenericInput
        control={form.control}
        name="name"
        label="Name"
        placeholder="My agent"
        isRequired={isRequired(schema, 'name')}
      />
      <InputField id="id" name="id" label="Id" value={agentId} disabled isRequired />
      <GenericTextarea
        control={form.control}
        name="description"
        label="Description"
        placeholder="This agent is used to..."
        isRequired={isRequired(schema, 'description')}
      />
      <GenericPromptEditor
        control={form.control}
        name="prompt"
        label="Agent prompt"
        placeholder="System-level instructions for this agent..."
        description="System-level prompt that defines the intended audience and overall goal of this agent. Applied to all sub agents."
        isRequired={isRequired(schema, 'prompt')}
      />
      <Separator />
      {/* Agent Model Settings */}
      <div className="space-y-8">
        <SectionHeader
          title="Default models"
          description="Set default models that will be inherited by sub agents that don't have their own models configured."
          titleTooltip={
            <>
              How model inheritance works:
              <ModelInheritanceInfo />
            </>
          }
        />
        <ModelConfiguration
          value={models.base.model}
          providerOptions={models.base.providerOptions}
          inheritedValue={project?.models?.base?.model}
          label={
            <div className="flex items-center gap-2">
              Base model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models.base.model,
                  project?.models?.base?.model
                )}
                size="sm"
              />
            </div>
          }
          description="Primary model for general agent responses"
          onModelChange={(value) => {
            if (value) {
              form.setValue('models.base.model', value, { shouldDirty: true });
            } else {
              form.setValue('models.base', {});
            }
          }}
          onProviderOptionsChange={(value) => {
            form.setValue('models.base.providerOptions', value);
          }}
          editorNamePrefix="agent-base"
        />

        <CollapsibleSettings
          defaultOpen={!!(models.structuredOutput.model || models.summarizer.model)}
          title="Advanced model options"
        >
          <div className="relative space-y-2">
            <ModelSelector
              value={models.structuredOutput.model || ''}
              inheritedValue={
                project?.models?.structuredOutput?.model ||
                models.base.model ||
                project?.models?.base?.model
              }
              onValueChange={(value) => {
                if (value) {
                  form.setValue('models.structuredOutput.model', value, { shouldDirty: true });
                } else {
                  form.setValue('models.structuredOutput', {});
                }
              }}
              label={
                <div className="flex items-center gap-2">
                  Structured output model
                  <InheritanceIndicator
                    {...getModelInheritanceStatus(
                      'agent',
                      models.structuredOutput.model,
                      project?.models?.structuredOutput?.model
                    )}
                    size="sm"
                  />
                </div>
              }
            />
            <p className="text-xs text-muted-foreground">
              Model for structured outputs and components (defaults to base model)
            </p>
          </div>
          {/* Structured Output Model Provider Options */}
          {models.structuredOutput.model && (
            <GenericJsonEditor
              control={form.control}
              label="Structured output model provider options"
              name="models.structuredOutput.providerOptions"
              placeholder={structuredOutputModelProviderOptionsTemplate}
              customTemplate={structuredOutputModelProviderOptionsTemplate}
              isRequired={isRequired(schema, 'models.structuredOutput.providerOptions')}
            />
          )}
          <div className="relative space-y-2">
            <ModelSelector
              value={models.summarizer.model || ''}
              inheritedValue={
                project?.models?.summarizer?.model ||
                models.base.model ||
                project?.models?.base?.model
              }
              onValueChange={(value) => {
                if (value) {
                  form.setValue('models.summarizer.model', value, { shouldDirty: true });
                } else {
                  form.setValue('models.summarizer', {});
                }
              }}
              label={
                <div className="flex items-center gap-2">
                  Summarizer model
                  <InheritanceIndicator
                    {...getModelInheritanceStatus(
                      'agent',
                      models.summarizer.model,
                      project?.models?.summarizer?.model
                    )}
                    size="sm"
                  />
                </div>
              }
            />
            <p className="text-xs text-muted-foreground">
              Model for summarization tasks (defaults to base model)
            </p>
          </div>
          {/* Summarizer Model Provider Options */}
          {models.summarizer.model && (
            <GenericJsonEditor
              control={form.control}
              name="models.summarizer.providerOptions"
              label="Summarizer model provider options"
              placeholder={summarizerModelProviderOptionsTemplate}
              customTemplate={summarizerModelProviderOptionsTemplate}
              isRequired={isRequired(schema, 'models.summarizer.providerOptions')}
            />
          )}
        </CollapsibleSettings>
      </div>

      <Separator />

      {/* Agent Execution Limits */}
      <div className="space-y-8">
        <SectionHeader
          title="Execution limits"
          description="Configure agent-level execution limits for transfers between agents."
          titleTooltip={
            <div>
              <p>How execution limit inheritance works:</p>
              <ExecutionLimitInheritanceInfo />
            </div>
          }
        />

        <div className="space-y-2">
          <GenericInput
            control={form.control}
            label={
              <>
                Max transfers
                <InheritanceIndicator
                  {...getExecutionLimitInheritanceStatus(
                    'agent',
                    'transferCountIs',
                    transferCountIs,
                    project?.stopWhen?.transferCountIs
                  )}
                  size="sm"
                />
              </>
            }
            name="stopWhen.transferCountIs"
            type="number"
            placeholder="10"
            description="Maximum number of agent transfers per conversation (defaults to 10 if not set)"
            isRequired={isRequired(schema, 'stopWhen.transferCountIs')}
          />
        </div>
      </div>

      <Separator />

      {/* Structured Updates Configuration */}
      <div className="space-y-8">
        <SectionHeader
          title="Status updates"
          description="Configure structured status updates for conversation progress tracking."
        />
        <div className="space-y-8">
          <FormField
            control={form.control}
            name="statusUpdates.enabled"
            render={({ field }) => (
              <FormItem>
                <div className="flex gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel isRequired={isRequired(schema, 'statusUpdates.enabled')}>
                    Enable status updates
                  </FormLabel>
                </div>
                <FormDescription>
                  Send structured status updates during conversation execution
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {isStatusUpdateEnabled && (
            <CollapsibleSettings title="Status updates configuration">
              <GenericTextarea
                control={form.control}
                label="Status updates prompt"
                name="statusUpdates.prompt"
                placeholder="Generate a status update describing the current progress..."
                description="Custom prompt for generating status updates"
                isRequired={isRequired(schema, 'statusUpdates.prompt')}
              />

              <div className="space-y-4">
                <Label>Update frequency type</Label>
                <div className="flex gap-2 items-center">
                  <Checkbox
                    id="event-based-updates"
                    className="bg-background"
                    checked={numEvents !== undefined}
                    onCheckedChange={(checked) => {
                      const value = checked ? 10 : undefined;
                      form.setValue('statusUpdates.numEvents', value, { shouldDirty: true });
                    }}
                  />
                  <Label htmlFor="event-based-updates">Event-based updates</Label>
                  <br />
                  <Checkbox
                    id="time-based-updates"
                    className="bg-background"
                    checked={timeInSeconds !== undefined}
                    onCheckedChange={(checked) => {
                      const value = checked ? 30 : undefined;
                      form.setValue('statusUpdates.timeInSeconds', value, { shouldDirty: true });
                    }}
                  />
                  <Label htmlFor="time-based-updates">Time-based updates</Label>
                </div>
              </div>
              {numEvents !== undefined && (
                <GenericInput
                  control={form.control}
                  label="Number of events"
                  type="number"
                  name="statusUpdates.numEvents"
                  placeholder="10"
                  description="Number of events/steps between status updates (default: 10)"
                  isRequired={isRequired(schema, 'statusUpdates.numEvents')}
                />
              )}
              {timeInSeconds !== undefined && (
                <GenericInput
                  control={form.control}
                  label="Time interval (seconds)"
                  type="number"
                  name="statusUpdates.timeInSeconds"
                  placeholder="30"
                  description="Time interval in seconds between status updates (default: 30)"
                  isRequired={isRequired(schema, 'statusUpdates.timeInSeconds')}
                />
              )}

              <GenericJsonEditor
                control={form.control}
                label="Status components configuration"
                name="statusUpdates.statusComponents"
                placeholder={statusUpdatesComponentsTemplate}
                customTemplate={statusUpdatesComponentsTemplate}
                description="Define structured components for status updates. Each component has a type (required), description, and detailsSchema."
                isRequired={isRequired(schema, 'statusUpdates.statusComponents')}
              />
            </CollapsibleSettings>
          )}
        </div>
      </div>

      <Separator />
      <ContextConfigForm />
    </div>
  );
};
