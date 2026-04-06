import { useWatch, type Control } from 'react-hook-form';
import type { AgentModels } from '@/components/agent/configuration/agent-types';
import type {
  FullAgentFormInputValues,
  FullAgentFormValues,
} from '@/components/agent/form/validation';
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
import { CollapsibleSettings } from '../collapsible-settings';
import { SectionHeader } from '../section';

interface ModelSectionProps {
  control: Control<FullAgentFormInputValues, unknown, FullAgentFormValues>;
  basePath: 'models' | `subAgents.${string}.models`;
  projectModels?: any;
  agentModels?: any;
}

export function ModelSection({ projectModels, agentModels, control, basePath }: ModelSectionProps) {
  const models = useWatch({ control, name: basePath }) as AgentModels;
  const hasAdvancedOptions = models.structuredOutput?.model || models.summarizer?.model;

  function getInheritance(key: 'structuredOutput' | 'summarizer') {
    const agentModel = agentModels?.[key];
    if (agentModel?.model) {
      return {
        model: agentModel.model,
        options: agentModel.providerOptions,
        fallbackModels: agentModel.fallbackModels,
        allowedProviders: agentModel.allowedProviders,
      };
    }
    const projectModel = projectModels?.[key];
    if (projectModel?.model) {
      return {
        model: projectModel.model,
        options: projectModel.providerOptions,
        fallbackModels: projectModel.fallbackModels,
        allowedProviders: projectModel.allowedProviders,
      };
    }
    if (models?.base?.model) {
      return {
        model: models.base.model,
        options: models.base.providerOptions,
        fallbackModels: models.base.fallbackModels,
        allowedProviders: models.base.allowedProviders,
      };
    }
    if (agentModels?.base?.model) {
      return {
        model: agentModels.base.model,
        options: agentModels.base.providerOptions,
        fallbackModels: agentModels.base.fallbackModels,
        allowedProviders: agentModels.base.allowedProviders,
      };
    }
    if (projectModels?.base?.model) {
      return {
        model: projectModels.base.model,
        options: projectModels.base.providerOptions,
        fallbackModels: projectModels.base.fallbackModels,
        allowedProviders: projectModels.base.allowedProviders,
      };
    }
    return {
      model: undefined,
      options: undefined,
      fallbackModels: undefined,
      allowedProviders: undefined,
    };
  }

  const structuredOutputInheritance = getInheritance('structuredOutput');
  const summarizerInheritance = getInheritance('summarizer');
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
        control={control}
        name={`${basePath}.base`}
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
        editorNamePrefix="base"
        inheritedFallbackModels={
          agentModels?.base?.fallbackModels || projectModels?.base?.fallbackModels
        }
        inheritedAllowedProviders={
          agentModels?.base?.allowedProviders || projectModels?.base?.allowedProviders
        }
      />

      <CollapsibleSettings defaultOpen={!!hasAdvancedOptions} title="Advanced Model Options">
        <ModelConfiguration
          control={control}
          name={`${basePath}.structuredOutput`}
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
          editorNamePrefix="structured"
          getJsonPlaceholder={(model) => {
            if (model?.startsWith('azure/')) {
              return azureModelProviderOptionsTemplate;
            }
            return structuredOutputModelProviderOptionsTemplate;
          }}
          inheritedFallbackModels={structuredOutputInheritance.fallbackModels}
          inheritedAllowedProviders={structuredOutputInheritance.allowedProviders}
        />

        <ModelConfiguration
          control={control}
          name={`${basePath}.summarizer`}
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
          editorNamePrefix="summarizer"
          getJsonPlaceholder={(model) => {
            if (model?.startsWith('azure/')) {
              return azureModelSummarizerProviderOptionsTemplate;
            }
            return summarizerModelProviderOptionsTemplate;
          }}
          inheritedFallbackModels={summarizerInheritance.fallbackModels}
          inheritedAllowedProviders={summarizerInheritance.allowedProviders}
        />
      </CollapsibleSettings>
    </div>
  );
}
