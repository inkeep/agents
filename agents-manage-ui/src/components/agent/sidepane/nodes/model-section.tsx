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

  // Helper to get inherited model and provider options from the same source
  const getStructuredOutputInheritance = () => {
    if (agentModels?.structuredOutput?.model) {
      return {
        model: agentModels.structuredOutput.model,
        options: agentModels.structuredOutput.providerOptions,
      };
    }
    if (projectModels?.structuredOutput?.model) {
      return {
        model: projectModels.structuredOutput.model,
        options: projectModels.structuredOutput.providerOptions,
      };
    }
    if (models?.base?.model) {
      return { model: models.base.model, options: models.base.providerOptions };
    }
    if (agentModels?.base?.model) {
      return { model: agentModels.base.model, options: agentModels.base.providerOptions };
    }
    if (projectModels?.base?.model) {
      return { model: projectModels.base.model, options: projectModels.base.providerOptions };
    }
    return { model: undefined, options: undefined };
  };

  const getSummarizerInheritance = () => {
    if (agentModels?.summarizer?.model) {
      return {
        model: agentModels.summarizer.model,
        options: agentModels.summarizer.providerOptions,
      };
    }
    if (projectModels?.summarizer?.model) {
      return {
        model: projectModels.summarizer.model,
        options: projectModels.summarizer.providerOptions,
      };
    }
    if (models?.base?.model) {
      return { model: models.base.model, options: models.base.providerOptions };
    }
    if (agentModels?.base?.model) {
      return { model: agentModels.base.model, options: agentModels.base.providerOptions };
    }
    if (projectModels?.base?.model) {
      return { model: projectModels.base.model, options: projectModels.base.providerOptions };
    }
    return { model: undefined, options: undefined };
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
        />
      </CollapsibleSettings>
    </div>
  );
}
