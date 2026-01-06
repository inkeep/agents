import type { AgentNodeData } from '@/components/agent/configuration/node-types';
import { ModelInheritanceInfo } from '@/components/projects/form/model-inheritance-info';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import {
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
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
  const _hasAnyModel = models?.base || models?.structuredOutput || models?.summarizer;

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
          inheritedValue={
            agentModels?.structuredOutput?.model ||
            projectModels?.structuredOutput?.model ||
            models?.base?.model ||
            agentModels?.base?.model ||
            projectModels?.base?.model
          }
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
        />

        <ModelConfiguration
          value={models?.summarizer?.model}
          providerOptions={models?.summarizer?.providerOptions}
          inheritedValue={
            agentModels?.summarizer?.model ||
            projectModels?.summarizer?.model ||
            models?.base?.model ||
            agentModels?.base?.model ||
            projectModels?.base?.model
          }
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
              return `{
  "resourceName": "your-azure-resource",
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;
            }
            return `{
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;
          }}
        />
      </CollapsibleSettings>
    </div>
  );
}
