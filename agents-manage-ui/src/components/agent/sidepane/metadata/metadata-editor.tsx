'use client';

import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { useWatch } from 'react-hook-form';
import { FullAgentFormSchema as schema } from '@/components/agent/form/validation';
import { GenericCheckbox } from '@/components/form/generic-checkbox';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { ModelInheritanceInfo } from '@/components/projects/form/model-inheritance-info';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { ExternalLink } from '@/components/ui/external-link';
import {
  getExecutionLimitInheritanceStatus,
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useProjectPermissionsQuery, useProjectQuery } from '@/lib/query/projects';
import {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  statusUpdatesComponentsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { isRequired } from '@/lib/utils';
import { GenericPromptEditor } from '../../../form/generic-prompt-editor';
import { CollapsibleSettings } from '../collapsible-settings';
import { FieldLabel } from '../form-components/label';
import { SectionHeader } from '../section';
import { ContextConfigForm } from './context-config';

const executionLimitInheritanceInfo = (
  <ul className="space-y-1.5 list-disc list-outside pl-4">
    <li>
      <b>transferCountIs</b>: Project → Agent only (controls transfers between sub agents)
    </li>
    <li>
      <b>Explicit settings</b> always take precedence over inherited values
    </li>
    <li>
      <b>Default fallback</b>: transferCountIs = 10 if no value is set anywhere
    </li>
    <li>
      <b>Agent scope</b>: This limit applies to all sub agents within this agent
    </li>
  </ul>
);

export const MetadataEditor: FC = () => {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const baseUrl = PUBLIC_INKEEP_AGENTS_API_URL;
  const {
    data: { canUse },
  } = useProjectPermissionsQuery();
  // Fetch project data for inheritance indicators
  const { data: project } = useProjectQuery();
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
          label="Chat API Base URL"
          tooltip="Use this endpoint to chat with your agent by appending /run/api/chat or connect it to the Inkeep widget via the baseUrl prop and specifying the appId. Supports streaming responses with the Vercel AI SDK data stream protocol."
        />
        <CopyableSingleLineCode code={baseUrl} />
        {canUse && (
          <ExternalLink href={`/${tenantId}/projects/${projectId}/apps`}>Create App</ExternalLink>
        )}
      </div>
      <GenericInput
        control={form.control}
        name="name"
        label="Name"
        placeholder="My agent"
        isRequired={isRequired(schema, 'name')}
      />
      <GenericInput control={form.control} name="id" label="Id" disabled isRequired />
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
          inheritedValue={project?.models.base?.model}
          inheritedProviderOptions={project?.models.base?.providerOptions}
          label={
            <div className="flex items-center gap-2">
              Base model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models.base.model,
                  project?.models.base?.model
                )}
                size="sm"
              />
            </div>
          }
          description="Primary model for general agent responses"
          onModelChange={(value) => {
            form.setValue('models.base.model', value, { shouldDirty: true });
          }}
          onProviderOptionsChange={(value) => {
            form.setValue('models.base.providerOptions', value, { shouldDirty: true });
          }}
          editorNamePrefix="agent-base"
        />

        <CollapsibleSettings
          defaultOpen={!!(models.structuredOutput.model || models.summarizer.model)}
          title="Advanced model options"
        >
          <ModelConfiguration
            value={models.structuredOutput?.model}
            providerOptions={models.structuredOutput?.providerOptions}
            inheritedValue={
              project?.models.structuredOutput?.model ||
              models.base.model ||
              project?.models.base?.model
            }
            inheritedProviderOptions={
              project?.models.structuredOutput?.model
                ? project?.models.structuredOutput?.providerOptions
                : undefined
            }
            label={
              <div className="flex items-center gap-2">
                Structured output model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models.structuredOutput.model,
                    project?.models.structuredOutput?.model
                  )}
                  size="sm"
                />
              </div>
            }
            description="Model for structured outputs and components (defaults to base model)"
            canClear
            onModelChange={(value) => {
              form.setValue('models.structuredOutput.model', value, { shouldDirty: true });
            }}
            onProviderOptionsChange={(value) => {
              form.setValue('models.structuredOutput.providerOptions', value, {
                shouldDirty: true,
              });
            }}
            editorNamePrefix="agent-structured"
            getJsonPlaceholder={(model) => {
              if (model?.startsWith('azure/')) {
                return azureModelProviderOptionsTemplate;
              }
              return structuredOutputModelProviderOptionsTemplate;
            }}
          />

          <ModelConfiguration
            value={models.summarizer?.model}
            providerOptions={models.summarizer?.providerOptions}
            inheritedValue={
              project?.models.summarizer?.model || models.base.model || project?.models.base?.model
            }
            inheritedProviderOptions={
              project?.models.summarizer?.model
                ? project?.models.summarizer?.providerOptions
                : undefined
            }
            label={
              <div className="flex items-center gap-2">
                Summarizer model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models.summarizer.model,
                    project?.models.summarizer?.model
                  )}
                  size="sm"
                />
              </div>
            }
            description="Model for summarization tasks (defaults to base model)"
            canClear
            onModelChange={(value) => {
              form.setValue('models.summarizer.model', value, { shouldDirty: true });
            }}
            onProviderOptionsChange={(value) => {
              form.setValue('models.summarizer.providerOptions', value, { shouldDirty: true });
            }}
            editorNamePrefix="agent-summarizer"
            getJsonPlaceholder={(model) => {
              if (model?.startsWith('azure/')) {
                return azureModelSummarizerProviderOptionsTemplate;
              }
              return summarizerModelProviderOptionsTemplate;
            }}
          />
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
              {executionLimitInheritanceInfo}
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

      {/* Execution Mode */}
      <div className="space-y-8">
        <SectionHeader
          title="Execution mode"
          description="Choose how agent execution is managed. Durable mode persists execution state, enabling tool approvals and crash recovery."
        />
        <div className="space-y-2">
          <Label htmlFor="execution-mode">Mode</Label>
          <Select
            value={executionMode ?? 'classic'}
            onValueChange={(value) =>
              updateMetadata('executionMode', value as 'classic' | 'durable')
            }
          >
            <SelectTrigger id="execution-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="durable">Durable</SelectItem>
            </SelectContent>
          </Select>
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
          <GenericCheckbox
            control={form.control}
            name="statusUpdates.enabled"
            label="Enable status updates"
            isRequired={isRequired(schema, 'statusUpdates.enabled')}
            description="Send structured status updates during conversation execution"
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
