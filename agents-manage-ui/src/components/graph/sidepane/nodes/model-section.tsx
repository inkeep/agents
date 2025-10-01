import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import type { AgentNodeData } from '@/components/graph/configuration/node-types';
import { ModelInheritanceInfo } from '@/components/projects/form/model-inheritance-info';
import {
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import { CollapsibleSettings } from '../collapsible-settings';
import { SectionHeader } from '../section';
import { ModelSelector } from './model-selector';

interface ModelSectionProps {
  models: AgentNodeData['models'];
  updatePath: (path: string, value: any) => void;
  projectModels?: any;
  graphModels?: any;
}

export function ModelSection({
  models,
  updatePath,
  projectModels,
  graphModels,
}: ModelSectionProps) {
  const hasAdvancedOptions = models?.structuredOutput || models?.summarizer;
  const _hasAnyModel = models?.base || models?.structuredOutput || models?.summarizer;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Models"
        description="Configure agent-level models."
        titleTooltip={
          <div>
            <p>How model inheritance works:</p>
            <ModelInheritanceInfo />
          </div>
        }
      />
      <div className="relative space-y-2">
        <ModelSelector
          value={models?.base?.model || ''}
          onValueChange={(modelValue) => {
            updatePath('models.base.model', modelValue || undefined);
          }}
          inheritedValue={graphModels?.base?.model || projectModels?.base?.model}
          label={
            <div className="flex items-center gap-2">
              Base model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models?.base?.model,
                  graphModels?.base?.model,
                  projectModels?.base?.model
                )}
                size="sm"
              />
            </div>
          }
        />
        <p className="text-xs text-muted-foreground">Primary model for general agent responses</p>
      </div>

      <CollapsibleSettings defaultOpen={!!hasAdvancedOptions} title="Advanced Model Options">
        {/* Base Model Provider Options */}
        {models?.base?.model && (
          <ExpandableJsonEditor
            name="base-provider-options"
            label="Base model provider options"
            onChange={(value) => {
              updatePath('models.base.providerOptions', value);
            }}
            value={models?.base?.providerOptions || ''}
            placeholder={`{
  "temperature": 0.7,
  "maxTokens": 2048
}`}
          />
        )}
        <div className="relative space-y-2">
          <ModelSelector
            value={models?.structuredOutput?.model || ''}
            onValueChange={(modelValue) => {
              console.log('modelValue', modelValue);
              updatePath('models.structuredOutput.model', modelValue || undefined);
            }}
            inheritedValue={
              graphModels?.structuredOutput?.model ||
              projectModels?.structuredOutput?.model ||
              models?.base?.model ||
              graphModels?.base?.model ||
              projectModels?.base?.model
            }
            label={
              <div className="flex items-center gap-2">
                Structured output model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models?.structuredOutput?.model,
                    graphModels?.structuredOutput?.model,
                    projectModels?.structuredOutput?.model
                  )}
                  size="sm"
                />
              </div>
            }
          />
          <p className="text-xs text-muted-foreground">
            The model used for structured output and components (defaults to base model)
          </p>
        </div>

        {/* Structured Output Model Provider Options */}
        {models?.structuredOutput?.model && (
          <ExpandableJsonEditor
            name="structured-provider-options"
            label="Structured output model provider options"
            onChange={(value) => {
              updatePath('models.structuredOutput.providerOptions', value);
            }}
            value={models?.structuredOutput?.providerOptions || ''}
            placeholder={`{
  "temperature": 0.1,
  "maxTokens": 1024
}`}
          />
        )}

        <div className="relative space-y-2">
          <ModelSelector
            value={models?.summarizer?.model || ''}
            onValueChange={(modelValue) => {
              updatePath('models.summarizer.model', modelValue || undefined);
            }}
            inheritedValue={
              graphModels?.summarizer?.model ||
              projectModels?.summarizer?.model ||
              models?.base?.model ||
              graphModels?.base?.model ||
              projectModels?.base?.model
            }
            label={
              <div className="flex items-center gap-2">
                Summarizer model
                <InheritanceIndicator
                  {...getModelInheritanceStatus(
                    'agent',
                    models?.summarizer?.model,
                    graphModels?.summarizer?.model,
                    projectModels?.summarizer?.model
                  )}
                  size="sm"
                />
              </div>
            }
          />
          <p className="text-xs text-muted-foreground">
            The model used for summarization tasks (defaults to base model)
          </p>
        </div>
        {/* Summarizer Model Provider Options */}
        {models?.summarizer?.model && (
          <ExpandableJsonEditor
            name="summarizer-provider-options"
            label="Summarizer model provider options"
            onChange={(value) => {
              updatePath('models.summarizer.providerOptions', value);
            }}
            value={models?.summarizer?.providerOptions || ''}
            placeholder={`{
  "temperature": 0.3,
  "maxTokens": 1024
}`}
          />
        )}
      </CollapsibleSettings>
    </div>
  );
}
