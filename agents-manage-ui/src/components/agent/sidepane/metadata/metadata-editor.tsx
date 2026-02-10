'use client';

import { Info } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectPermissions } from '@/contexts/project';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { agentStore, useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAutoPrefillIdZustand } from '@/hooks/use-auto-prefill-id-zustand';
import { useProjectData } from '@/hooks/use-project-data';
import {
  azureModelSummarizerProviderOptionsTemplate,
  statusUpdatesComponentsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { ExpandablePromptEditor } from '../../../editors/expandable-prompt-editor';
import { CollapsibleSettings } from '../collapsible-settings';
import { InputField } from '../form-components/input';
import { FieldLabel } from '../form-components/label';
import { TextareaField } from '../form-components/text-area';
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

export function MetadataEditor() {
  const { agentId, tenantId, projectId } = useParams();
  const metadata = useAgentStore((state) => state.metadata);
  const { id, name, description, contextConfig, models, stopWhen, prompt, statusUpdates } =
    metadata;
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const agentUrl = `${PUBLIC_INKEEP_AGENTS_API_URL}/run/api/chat`;
  const { canUse } = useProjectPermissions();

  // Fetch project data for inheritance indicators
  const { project } = useProjectData();

  const { markUnsaved, setMetadata } = useAgentActions();

  const updateMetadata: typeof setMetadata = useCallback((...attrs) => {
    setMetadata(...attrs);
    markUnsaved();
  }, []);

  // Helper to get the latest models from the store to avoid stale closure race conditions
  const getCurrentModels = useCallback(() => {
    return agentStore.getState().metadata.models;
  }, []);

  const handleIdChange = useCallback(
    (generatedId: string) => {
      updateMetadata('id', generatedId);
    },
    [updateMetadata]
  );

  // Auto-prefill ID based on name field (only for new agent)
  useAutoPrefillIdZustand({
    nameValue: name,
    idValue: id,
    onIdChange: handleIdChange,
    isEditing: !!agentId,
  });

  return (
    <div className="space-y-8">
      {agentId && (
        <div className="space-y-2">
          <div className="text-sm leading-none font-medium flex items-center gap-1">
            Chat URL
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Use this endpoint to chat with your agent or connect it to the Inkeep widget via the
                agentUrl prop. Supports streaming responses with the Vercel AI SDK data stream
                protocol.
              </TooltipContent>
            </Tooltip>
          </div>
          <CopyableSingleLineCode code={agentUrl} />
          {canUse && (
            <ExternalLink href={`/${tenantId}/projects/${projectId}/api-keys`}>
              Create API key
            </ExternalLink>
          )}
        </div>
      )}
      <InputField
        id="name"
        name="name"
        label="Name"
        value={name}
        onChange={(e) => updateMetadata('name', e.target.value)}
        placeholder="My agent"
        isRequired
      />
      <InputField
        id="id"
        name="id"
        label="Id"
        value={id || ''}
        onChange={(e) => updateMetadata('id', e.target.value)}
        disabled={!!agentId} // only editable if no agentId is set (i.e. new agent)
        placeholder="my-agent"
        description={
          !agentId
            ? 'Choose a unique identifier for this agent. Using an existing id will replace that agent.'
            : undefined
        }
        isRequired
      />
      <TextareaField
        id="description"
        name="description"
        label="Description"
        value={description}
        onChange={(e) => updateMetadata('description', e.target.value)}
        placeholder="This agent is used to..."
        className="max-h-96"
      />
      <div className="space-y-2">
        <ExpandablePromptEditor
          name="agent-prompt"
          label="Agent prompt"
          value={prompt}
          onChange={(value) => updateMetadata('prompt', value)}
          placeholder="System-level instructions for this agent..."
        />
        <p className="text-xs text-muted-foreground">
          System-level prompt that defines the intended audience and overall goal of this agent.
          Applied to all sub agents.
        </p>
      </div>
      <Separator />

      {/* Agent Model Settings */}
      <div className="space-y-8">
        <SectionHeader
          title="Default models"
          description="Set default models that will be inherited by sub agents that don't have their own models configured."
          titleTooltip={
            <div>
              <p>How model inheritance works:</p>
              <ModelInheritanceInfo />
            </div>
          }
        />
        <ModelConfiguration
          value={models?.base?.model}
          providerOptions={models?.base?.providerOptions}
          inheritedValue={project?.models?.base?.model}
          inheritedProviderOptions={project?.models?.base?.providerOptions}
          label={
            <div className="flex items-center gap-2">
              Base model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models?.base?.model,
                  project?.models?.base?.model
                )}
                size="sm"
              />
            </div>
          }
          description="Primary model for general agent responses"
          onModelChange={(value) => {
            const newModels = {
              base:
                value && value.trim() !== ''
                  ? {
                      model: value,
                    }
                  : undefined,
              structuredOutput: models?.structuredOutput
                ? { ...models.structuredOutput }
                : undefined,
              summarizer: models?.summarizer ? { ...models.summarizer } : undefined,
            };
            updateMetadata('models', newModels);
          }}
          onProviderOptionsChange={(value) => {
            const currentModels = getCurrentModels();
            // If there's no base model in the store yet, check the component's `models` prop
            // which reflects the latest state from the selector (handles timing issues)
            const baseModel = currentModels?.base?.model || models?.base?.model;
            if (!baseModel) {
              return;
            }
            const newModels = {
              ...(currentModels || models || {}),
              base: {
                ...(currentModels?.base || models?.base || {}),
                model: baseModel,
                providerOptions: value,
              },
            };
            updateMetadata('models', newModels);
          }}
          editorNamePrefix="agent-base"
        />

        <CollapsibleSettings
          defaultOpen={!!models?.structuredOutput || !!models?.summarizer}
          title="Advanced model options"
        >
          <ModelConfiguration
            key={`structured-${models?.structuredOutput?.model ?? 'unset'}`}
            value={models?.structuredOutput?.model}
            providerOptions={models?.structuredOutput?.providerOptions}
            inheritedValue={
              project?.models?.structuredOutput?.model ||
              models?.base?.model ||
              project?.models?.base?.model
            }
            inheritedProviderOptions={
              project?.models?.structuredOutput?.model
                ? project?.models?.structuredOutput?.providerOptions
                : models?.base?.model
                  ? models?.base?.providerOptions
                  : project?.models?.base?.providerOptions
            }
            label={
              <div className="flex items-center gap-2">
                Structured output model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models?.structuredOutput?.model,
                    project?.models?.structuredOutput?.model
                  )}
                  size="sm"
                />
              </div>
            }
            description="Model for structured outputs and components (defaults to base model)"
            canClear={true}
            onModelChange={(value) => {
              const newModels = {
                base: models?.base ? { ...models.base } : undefined,
                structuredOutput:
                  value && value.trim() !== ''
                    ? {
                        model: value,
                        providerOptions: undefined,
                      }
                    : undefined,
                summarizer: models?.summarizer ? { ...models.summarizer } : undefined,
              };
              updateMetadata('models', newModels);
            }}
            onProviderOptionsChange={(value) => {
              const currentModels = getCurrentModels();
              const structuredOutputModel =
                currentModels?.structuredOutput?.model || models?.structuredOutput?.model;
              if (!structuredOutputModel) {
                return;
              }
              const newModels = {
                ...(currentModels || {}),
                structuredOutput: {
                  model: structuredOutputModel,
                  providerOptions: value,
                },
              };
              updateMetadata('models', newModels);
            }}
            editorNamePrefix="agent-structured"
          />

          <ModelConfiguration
            key={`summarizer-${models?.summarizer?.model ?? 'unset'}`}
            value={models?.summarizer?.model}
            providerOptions={models?.summarizer?.providerOptions}
            inheritedValue={
              project?.models?.summarizer?.model ||
              models?.base?.model ||
              project?.models?.base?.model
            }
            inheritedProviderOptions={
              project?.models?.summarizer?.model
                ? project?.models?.summarizer?.providerOptions
                : models?.base?.model
                  ? models?.base?.providerOptions
                  : project?.models?.base?.providerOptions
            }
            label={
              <div className="flex items-center gap-2">
                Summarizer model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models?.summarizer?.model,
                    project?.models?.summarizer?.model
                  )}
                  size="sm"
                />
              </div>
            }
            description="Model for summarization tasks (defaults to base model)"
            canClear={true}
            onModelChange={(value) => {
              const newModels = {
                base: models?.base ? { ...models.base } : undefined,
                structuredOutput: models?.structuredOutput
                  ? { ...models.structuredOutput }
                  : undefined,
                summarizer:
                  value && value.trim() !== ''
                    ? {
                        model: value,
                        providerOptions: undefined,
                      }
                    : undefined,
              };
              updateMetadata('models', newModels);
            }}
            onProviderOptionsChange={(value) => {
              const currentModels = getCurrentModels();
              const summarizerModel = currentModels?.summarizer?.model || models?.summarizer?.model;
              if (!summarizerModel) {
                return;
              }
              const newModels = {
                ...(currentModels || {}),
                summarizer: {
                  model: summarizerModel,
                  providerOptions: value,
                },
              };
              updateMetadata('models', newModels);
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
              <ExecutionLimitInheritanceInfo />
            </div>
          }
        />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="transfer-count">Max transfers</Label>
            <InheritanceIndicator
              {...getExecutionLimitInheritanceStatus(
                'agent',
                'transferCountIs',
                stopWhen?.transferCountIs,
                project?.stopWhen?.transferCountIs
              )}
              size="sm"
            />
          </div>
          <Input
            id="transfer-count"
            type="number"
            min="1"
            max="100"
            value={stopWhen?.transferCountIs || ''}
            onChange={(e) => {
              const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
              updateMetadata('stopWhen', {
                ...(stopWhen || {}),
                transferCountIs: value,
              });
            }}
            placeholder="10"
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of agent transfers per conversation (defaults to 10 if not set)
          </p>
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
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="status-updates-enabled"
                checked={statusUpdates?.enabled ?? true}
                onCheckedChange={(checked) => {
                  updateMetadata('statusUpdates', {
                    ...(statusUpdates || {}),
                    enabled: checked === true,
                  });
                }}
              />
              <Label htmlFor="status-updates-enabled">Enable status updates</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Send structured status updates during conversation execution
            </p>
          </div>

          {(statusUpdates?.enabled ?? true) && (
            <CollapsibleSettings title="Status updates configuration">
              <div className="space-y-2">
                <Label htmlFor="status-updates-prompt">Status updates prompt</Label>
                <Textarea
                  id="status-updates-prompt"
                  value={statusUpdates?.prompt || ''}
                  onChange={(e) => {
                    updateMetadata('statusUpdates', {
                      ...(statusUpdates || {}),
                      prompt: e.target.value,
                    });
                  }}
                  placeholder="Generate a status update describing the current progress..."
                  className="max-h-32 bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Custom prompt for generating status updates (optional)
                </p>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <Label>Update frequency type</Label>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="event-based-updates"
                        className="bg-background"
                        checked={statusUpdates && 'numEvents' in statusUpdates}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateMetadata('statusUpdates', {
                              ...(statusUpdates || {}),
                              numEvents: statusUpdates?.numEvents || 10,
                            });
                          } else {
                            const newConfig = { ...statusUpdates };
                            delete newConfig.numEvents;
                            updateMetadata('statusUpdates', newConfig);
                          }
                        }}
                      />
                      <Label htmlFor="event-based-updates">Event-based updates</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="time-based-updates"
                        className="bg-background"
                        checked={statusUpdates && 'timeInSeconds' in statusUpdates}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateMetadata('statusUpdates', {
                              ...(statusUpdates || {}),
                              timeInSeconds: statusUpdates?.timeInSeconds || 30,
                            });
                          } else {
                            const newConfig = { ...statusUpdates };
                            delete newConfig.timeInSeconds;
                            updateMetadata('statusUpdates', newConfig);
                          }
                        }}
                      />
                      <Label htmlFor="time-based-updates">Time-based updates</Label>
                    </div>
                  </div>
                </div>

                {statusUpdates && 'numEvents' in statusUpdates && (
                  <div className="space-y-2">
                    <Label htmlFor="num-events">Number of events</Label>
                    <Input
                      id="num-events"
                      type="number"
                      min="1"
                      max="100"
                      value={statusUpdates.numEvents || ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        updateMetadata('statusUpdates', {
                          ...(statusUpdates || {}),
                          numEvents: value,
                        });
                      }}
                      placeholder="10"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of events/steps between status updates (default: 10)
                    </p>
                  </div>
                )}

                {statusUpdates && 'timeInSeconds' in statusUpdates && (
                  <div className="space-y-2">
                    <Label htmlFor="time-in-seconds">Time interval (seconds)</Label>
                    <Input
                      id="time-in-seconds"
                      type="number"
                      min="1"
                      max="600"
                      value={statusUpdates.timeInSeconds || ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        updateMetadata('statusUpdates', {
                          ...(statusUpdates || {}),
                          timeInSeconds: value,
                        });
                      }}
                      placeholder="30"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Time interval in seconds between status updates (default: 30)
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabel id="status-components" label="Status components configuration" />
                <StandaloneJsonEditor
                  name="status-components"
                  onChange={(value) => {
                    updateMetadata('statusUpdates', {
                      ...(statusUpdates || {}),
                      statusComponents: value,
                    });
                  }}
                  value={statusUpdates?.statusComponents || ''}
                  placeholder={statusUpdatesComponentsTemplate}
                  customTemplate={statusUpdatesComponentsTemplate}
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Define structured components for status updates. Each component has a type
                  (required), description, and detailsSchema.
                </p>
              </div>
            </CollapsibleSettings>
          )}
        </div>
      </div>

      <Separator />
      <ContextConfigForm contextConfig={contextConfig} updateMetadata={updateMetadata} />
    </div>
  );
}
