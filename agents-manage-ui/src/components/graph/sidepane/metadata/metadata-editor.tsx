'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  getExecutionLimitInheritanceStatus,
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import { useAutoPrefillIdZustand } from '@/hooks/use-auto-prefill-id-zustand';
import { useProjectData } from '@/hooks/use-project-data';
import { INKEEP_AGENTS_RUN_API_URL } from '@/lib/api/api-config';
import { ExpandableTextArea } from '../nodes/expandable-text-area';
import { InputField, TextareaField } from '../nodes/form-fields';
import { ModelSelector } from '../nodes/model-selector';
import { ContextConfigForm } from './context-config';
import { ExternalLink } from '@/components/ui/external-link';

function MetadataEditor() {
  const params = useParams();
  const metadata = useGraphStore((state) => state.metadata);
  const { graphId, tenantId, projectId } = params;
  const { id, name, description, contextConfig, models, stopWhen, graphPrompt, statusUpdates } =
    metadata;
  const graphUrl = `${INKEEP_AGENTS_RUN_API_URL}/api/chat`;

  // Fetch project data for inheritance indicators
  const { project } = useProjectData();

  const { markUnsaved, setMetadata } = useGraphStore();

  const updateMetadata: typeof setMetadata = useCallback(
    (...attrs) => {
      setMetadata(...attrs);
      markUnsaved();
    },
    [setMetadata, markUnsaved]
  );

  const handleIdChange = useCallback(
    (generatedId: string) => {
      updateMetadata('id', generatedId);
    },
    [updateMetadata]
  );

  // Auto-prefill ID based on name field (only for new graphs)
  useAutoPrefillIdZustand({
    nameValue: name,
    idValue: id,
    onIdChange: handleIdChange,
    isEditing: !!graphId,
  });

  return (
    <div className="space-y-8">
      {graphId && (
        <div className="space-y-2">
          <div className="text-sm leading-none font-medium flex items-center gap-1">
            Chat URL
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Use this endpoint to chat with your graph or connect it to the Inkeep widget via the
                graphUrl prop. Supports streaming responses with the Vercel AI SDK data stream
                protocol.
              </TooltipContent>
            </Tooltip>
          </div>
          <CopyableSingleLineCode code={graphUrl} />
          <ExternalLink href={`/${tenantId}/projects/${projectId}/api-keys`}>
            Create API key
          </ExternalLink>
        </div>
      )}
      <InputField
        id="name"
        name="name"
        label="Name"
        value={name}
        onChange={(e) => updateMetadata('name', e.target.value)}
        placeholder="My graph"
        isRequired
      />
      <InputField
        id="id"
        name="id"
        label="Id"
        value={id || ''}
        onChange={(e) => updateMetadata('id', e.target.value)}
        disabled={!!graphId} // only editable if no graphId is set (i.e. new graph)
        placeholder="my-graph"
        description={
          !graphId
            ? 'Choose a unique identifier for this graph. Using an existing id will replace that graph.'
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
        placeholder="This graph is used to..."
        className="max-h-96"
      />
      <div className="space-y-2">
        <ExpandableTextArea
          id="graph-prompt"
          name="graph-prompt"
          label="Graph Prompt"
          value={graphPrompt || ''}
          onChange={(e) => updateMetadata('graphPrompt', e.target.value)}
          placeholder="System-level instructions for this graph..."
          className="max-h-96"
        />
        <p className="text-xs text-muted-foreground">
          System-level prompt that defines the intended audience and overall goal of this graph.
          Applied to all agents.
        </p>
      </div>
      <Separator />

      {/* Graph Model Settings */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Default Models</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Set default models that will be inherited by agents that don't have their own models
            configured.
          </p>
        </div>

        <div className="relative">
          <ModelSelector
            value={models?.base?.model || ''}
            inheritedValue={project?.models?.base?.model}
            onValueChange={(value) => {
              const newModels = {
                ...(models || {}),
                base: value
                  ? {
                      ...(models?.base || {}),
                      model: value,
                    }
                  : undefined,
              };
              updateMetadata('models', newModels);
            }}
            label={
              <div className="flex items-center gap-2">
                Base Model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'graph',
                    models?.base?.model,
                    project?.models?.base?.model
                  )}
                  size="sm"
                />
              </div>
            }
            tooltip="Primary model for general agent responses"
          />
        </div>

        <Collapsible
          defaultOpen={!!models?.structuredOutput || !!models?.summarizer}
          className="border rounded-md bg-muted/30 dark:bg-muted/20"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center justify-start gap-1.5 p-0 h-auto font-normal text-xs text-foreground/80 dark:text-foreground/90 hover:text-foreground hover:!bg-transparent transition-colors group w-full py-2 px-4"
            >
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
              Advanced Model Options
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-8 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
            <div className="relative">
              <ModelSelector
                value={models?.structuredOutput?.model || ''}
                inheritedValue={
                  project?.models?.structuredOutput?.model ||
                  models?.base?.model ||
                  project?.models?.base?.model
                }
                onValueChange={(value) => {
                  const newModels = {
                    ...(models || {}),
                    structuredOutput: value
                      ? {
                          ...(models?.structuredOutput || {}),
                          model: value,
                        }
                      : undefined,
                  };
                  updateMetadata('models', newModels);
                }}
                label={
                  <div className="flex items-center gap-2">
                    Structured output model
                    <InheritanceIndicator
                      {...getModelInheritanceStatus(
                        'graph',
                        models?.structuredOutput?.model,
                        project?.models?.structuredOutput?.model
                      )}
                      size="sm"
                    />
                  </div>
                }
                tooltip="Model for structured outputs and data components (defaults to base model)"
              />
            </div>
            <div className="relative">
              <ModelSelector
                value={models?.summarizer?.model || ''}
                inheritedValue={
                  project?.models?.summarizer?.model ||
                  models?.base?.model ||
                  project?.models?.base?.model
                }
                onValueChange={(value) => {
                  const newModels = {
                    ...(models || {}),
                    summarizer: value
                      ? {
                          ...(models?.summarizer || {}),
                          model: value,
                        }
                      : undefined,
                  };
                  updateMetadata('models', newModels);
                }}
                label={
                  <div className="flex items-center gap-2">
                    Summarizer model
                    <InheritanceIndicator
                      {...getModelInheritanceStatus(
                        'graph',
                        models?.summarizer?.model,
                        project?.models?.summarizer?.model
                      )}
                      size="sm"
                    />
                  </div>
                }
                tooltip="Model for summarization tasks (defaults to base model)"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            How model inheritance works:
          </p>
          <ul className="space-y-1 text-blue-800 dark:text-blue-200">
            <li>
              • <strong>Models</strong>: Project → Graph → Agent (partial inheritance - missing
              models only)
            </li>
            <li>
              • <strong>Individual model types</strong> inherit independently (base,
              structuredOutput, summarizer)
            </li>
            <li>
              • <strong>Explicit settings</strong> always take precedence over inherited values
            </li>
            <li>
              • <strong>Provider options</strong> are inherited along with the model if not
              explicitly set
            </li>
          </ul>
        </div>

        {/* Base Model Provider Options */}
        {models?.base?.model && (
          <ExpandableJsonEditor
            name="base-provider-options"
            label="Base Model Provider Options"
            onChange={(value) => {
              updateMetadata('models', {
                ...(models || {}),
                base: {
                  model: models.base?.model || '',
                  providerOptions: value,
                },
              });
            }}
            value={models.base.providerOptions || ''}
            placeholder={`{
    "temperature": 0.7,
    "maxTokens": 2048
}`}
          />
        )}

        {/* Structured Output Model Provider Options */}
        {models?.structuredOutput?.model && (
          <ExpandableJsonEditor
            name="structured-provider-options"
            label="Structured Output Model Provider Options"
            onChange={(value) => {
              updateMetadata('models', {
                ...(models || {}),
                structuredOutput: {
                  model: models.structuredOutput?.model || '',
                  providerOptions: value,
                },
              });
            }}
            value={models.structuredOutput.providerOptions || ''}
            placeholder={`{
  "temperature": 0.1,
  "maxTokens": 1024
}`}
          />
        )}

        {/* Summarizer Model Provider Options */}
        {models?.summarizer?.model && (
          <ExpandableJsonEditor
            name="summarizer-provider-options"
            label="Summarizer Model Provider Options"
            onChange={(value) => {
              updateMetadata('models', {
                ...(models || {}),
                summarizer: {
                  model: models.summarizer?.model || '',
                  providerOptions: value,
                },
              });
            }}
            value={models.summarizer.providerOptions || ''}
            placeholder={`{
  "temperature": 0.3,
  "maxTokens": 1024
}`}
          />
        )}
      </div>

      <Separator />

      {/* Graph Execution Limits */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Execution Limits</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure graph-level execution limits for transfers between agents.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="transfer-count">Max Transfers</Label>
            <InheritanceIndicator
              {...getExecutionLimitInheritanceStatus(
                'graph',
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

        <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            How execution limit inheritance works:
          </p>
          <ul className="space-y-1 text-blue-800 dark:text-blue-200">
            <li>
              • <strong>transferCountIs</strong>: Project → Graph only (controls transfers between
              agents)
            </li>
            <li>
              • <strong>Explicit settings</strong> always take precedence over inherited values
            </li>
            <li>
              • <strong>Default fallback</strong>: transferCountIs = 10 if no value is set anywhere
            </li>
            <li>
              • <strong>Graph scope</strong>: This limit applies to all agents within this graph
            </li>
          </ul>
        </div>
      </div>

      <Separator />

      {/* Structured Updates Configuration */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Status Updates</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure structured status updates for conversation progress tracking.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status-updates-enabled">Enable Status Updates</Label>
            <div className="flex items-center space-x-2">
              <input
                id="status-updates-enabled"
                type="checkbox"
                checked={statusUpdates?.enabled ?? true}
                onChange={(e) => {
                  updateMetadata('statusUpdates', {
                    ...(statusUpdates || {}),
                    enabled: e.target.checked,
                  });
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-muted-foreground">
                Send structured status updates during conversation execution
              </span>
            </div>
          </div>

          {(statusUpdates?.enabled ?? true) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="status-updates-prompt">Status Updates Prompt</Label>
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
                  className="max-h-32"
                />
                <p className="text-xs text-muted-foreground">
                  Custom prompt for generating status updates (optional)
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Update Frequency Type</Label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={!!statusUpdates?.numEvents}
                        onChange={(e) => {
                          if (e.target.checked) {
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Event-based updates</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={!!statusUpdates?.timeInSeconds}
                        onChange={(e) => {
                          if (e.target.checked) {
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Time-based updates</span>
                    </label>
                  </div>
                </div>

                {statusUpdates?.numEvents && (
                  <div className="space-y-2">
                    <Label htmlFor="num-events">Number of Events</Label>
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
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of events/steps between status updates (default: 10)
                    </p>
                  </div>
                )}

                {statusUpdates?.timeInSeconds && (
                  <div className="space-y-2">
                    <Label htmlFor="time-in-seconds">Time Interval (seconds)</Label>
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
                    />
                    <p className="text-xs text-muted-foreground">
                      Time interval in seconds between status updates (default: 30)
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-components">Status Components</Label>
                <ExpandableJsonEditor
                  name="status-components"
                  label="Status Components Configuration"
                  onChange={(value) => {
                    updateMetadata('statusUpdates', {
                      ...(statusUpdates || {}),
                      statusComponents: value,
                    });
                  }}
                  value={statusUpdates?.statusComponents || ''}
                  placeholder={`[
  {
    "id": "tool_call_summary",
    "name": "Tool Call",
    "description": "A summary of a single tool call and why it was relevant to the current task. Be specific about what was found or accomplished.",
    "schema": {
      "type": "object",
      "properties": {
        "tool_name": {
          "type": "string",
          "description": "The name of the tool that was called"
        },
        "summary": {
          "type": "string",
          "description": "Brief summary of what was accomplished. Keep it to 3-5 words."
        },
        "status": {
          "type": "string",
          "enum": ["success", "error", "in_progress"],
          "description": "Status of the tool call"
        }
      },
      "required": ["tool_name", "summary"]
    }
  }
]`}
                />
                <p className="text-xs text-muted-foreground">
                  Define structured components for status updates. Each component has an id, name,
                  description, and JSON schema.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />
      <ContextConfigForm contextConfig={contextConfig} updateMetadata={updateMetadata} />
    </div>
  );
}

export default MetadataEditor;
