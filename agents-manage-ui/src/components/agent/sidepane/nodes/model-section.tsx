import type { AgentNodeData } from '@/components/agent/configuration/node-types';
import { ModelInheritanceInfo } from '@/components/projects/form/model-inheritance-info';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import {
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
import {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { createProviderOptionsHandler } from '@/lib/utils';
import { CollapsibleSettings } from '../collapsible-settings';
import { SectionHeader } from '../section';

interface ModelSectionProps {
  models: AgentNodeData['models'];
  updatePath: (path: string, value: any) => void;
  projectModels?: any;
  agentModels?: any;
}

export function ModelSection({
  models,
  updatePath,
  projectModels,
  agentModels,
}: ModelSectionProps) {
  const hasAdvancedOptions = models?.structuredOutput || models?.summarizer;

  // Helper to get inherited model, provider options, and fallback models from the same source
  const getStructuredOutputInheritance = () => {
    if (agentModels?.structuredOutput?.model) {
      return {
        model: agentModels.structuredOutput.model,
        options: agentModels.structuredOutput.providerOptions,
        fallbackModels: agentModels.structuredOutput.fallbackModels,
      };
    }
    if (projectModels?.structuredOutput?.model) {
      return {
        model: projectModels.structuredOutput.model,
        options: projectModels.structuredOutput.providerOptions,
        fallbackModels: projectModels.structuredOutput.fallbackModels,
      };
    }
    if (models?.base?.model) {
      return {
        model: models.base.model,
        options: models.base.providerOptions,
        fallbackModels: models.base.fallbackModels,
      };
    }
    if (agentModels?.base?.model) {
      return {
        model: agentModels.base.model,
        options: agentModels.base.providerOptions,
        fallbackModels: agentModels.base.fallbackModels,
      };
    }
    if (projectModels?.base?.model) {
      return {
        model: projectModels.base.model,
        options: projectModels.base.providerOptions,
        fallbackModels: projectModels.base.fallbackModels,
      };
    }
    return { model: undefined, options: undefined, fallbackModels: undefined };
  };

  const getSummarizerInheritance = () => {
    if (agentModels?.summarizer?.model) {
      return {
        model: agentModels.summarizer.model,
        options: agentModels.summarizer.providerOptions,
        fallbackModels: agentModels.summarizer.fallbackModels,
      };
    }
    if (projectModels?.summarizer?.model) {
      return {
        model: projectModels.summarizer.model,
        options: projectModels.summarizer.providerOptions,
        fallbackModels: projectModels.summarizer.fallbackModels,
      };
    }
    if (models?.base?.model) {
      return {
        model: models.base.model,
        options: models.base.providerOptions,
        fallbackModels: models.base.fallbackModels,
      };
    }
    if (agentModels?.base?.model) {
      return {
        model: agentModels.base.model,
        options: agentModels.base.providerOptions,
        fallbackModels: agentModels.base.fallbackModels,
      };
    }
    if (projectModels?.base?.model) {
      return {
        model: projectModels.base.model,
        options: projectModels.base.providerOptions,
        fallbackModels: projectModels.base.fallbackModels,
      };
    }
    return { model: undefined, options: undefined, fallbackModels: undefined };
  };

  const structuredOutputInheritance = getStructuredOutputInheritance();
  const summarizerInheritance = getSummarizerInheritance();

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Models"
        description="Configure sub agent-level models."
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
        inheritedValue={agentModels?.base?.model || projectModels?.base?.model}
        inheritedProviderOptions={
          agentModels?.base?.model
            ? agentModels?.base?.providerOptions
            : projectModels?.base?.providerOptions
        }
        label={
          <div className="flex items-center gap-2">
            Base model
            <InheritanceIndicator
              {...getModelInheritanceStatus(
                'agent',
                models?.base?.model,
                agentModels?.base?.model,
                projectModels?.base?.model
              )}
              size="sm"
            />
          </div>
        }
        description="Primary model for general sub agent responses"
        onModelChange={(value) => updatePath('models.base.model', value || undefined)}
        onProviderOptionsChange={createProviderOptionsHandler((options) => {
          updatePath('models.base.providerOptions', options);
        })}
        editorNamePrefix="base"
        fallbackModels={models?.base?.fallbackModels}
        inheritedFallbackModels={
          agentModels?.base?.fallbackModels || projectModels?.base?.fallbackModels
        }
        onFallbackModelsChange={(models) =>
          updatePath('models.base.fallbackModels', models.length ? models : undefined)
        }
      />

      <CollapsibleSettings defaultOpen={!!hasAdvancedOptions} title="Advanced Model Options">
        <ModelConfiguration
          value={models?.structuredOutput?.model}
          providerOptions={models?.structuredOutput?.providerOptions}
          inheritedValue={structuredOutputInheritance.model}
          inheritedProviderOptions={structuredOutputInheritance.options}
          label={
            <div className="flex items-center gap-2">
              Structured output model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models?.structuredOutput?.model,
                  agentModels?.structuredOutput?.model,
                  projectModels?.structuredOutput?.model
                )}
                size="sm"
              />
            </div>
          }
          description="The model used for structured output and components (defaults to base model)"
          onModelChange={(value) => updatePath('models.structuredOutput.model', value || undefined)}
          onProviderOptionsChange={createProviderOptionsHandler((options) =>
            updatePath('models.structuredOutput.providerOptions', options)
          )}
          editorNamePrefix="structured"
          getJsonPlaceholder={(model) => {
            if (model?.startsWith('azure/')) {
              return azureModelProviderOptionsTemplate;
            }
            return structuredOutputModelProviderOptionsTemplate;
          }}
          fallbackModels={models?.structuredOutput?.fallbackModels}
          inheritedFallbackModels={structuredOutputInheritance.fallbackModels}
          onFallbackModelsChange={(models) =>
            updatePath('models.structuredOutput.fallbackModels', models.length ? models : undefined)
          }
        />

        <ModelConfiguration
          value={models?.summarizer?.model}
          providerOptions={models?.summarizer?.providerOptions}
          inheritedValue={summarizerInheritance.model}
          inheritedProviderOptions={summarizerInheritance.options}
          label={
            <div className="flex items-center gap-2">
              Summarizer model
              <InheritanceIndicator
                {...getModelInheritanceStatus(
                  'agent',
                  models?.summarizer?.model,
                  agentModels?.summarizer?.model,
                  projectModels?.summarizer?.model
                )}
                size="sm"
              />
            </div>
          }
          description="The model used for summarization tasks (defaults to base model)"
          onModelChange={(value) => updatePath('models.summarizer.model', value || undefined)}
          onProviderOptionsChange={createProviderOptionsHandler((options) =>
            updatePath('models.summarizer.providerOptions', options)
          )}
          editorNamePrefix="summarizer"
          getJsonPlaceholder={(model) => {
            if (model?.startsWith('azure/')) {
              return azureModelSummarizerProviderOptionsTemplate;
            }
            return summarizerModelProviderOptionsTemplate;
          }}
          fallbackModels={models?.summarizer?.fallbackModels}
          inheritedFallbackModels={summarizerInheritance.fallbackModels}
          onFallbackModelsChange={(models) =>
            updatePath('models.summarizer.fallbackModels', models.length ? models : undefined)
          }
        />
      </CollapsibleSettings>
    </div>
  );
}
