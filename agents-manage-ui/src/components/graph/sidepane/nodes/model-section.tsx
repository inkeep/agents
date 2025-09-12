import { ChevronRight } from 'lucide-react';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import type { AgentNodeData } from '@/components/graph/configuration/node-types';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  getModelInheritanceStatus,
  InheritanceIndicator,
} from '@/components/ui/inheritance-indicator';
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
    <div className="space-y-4">
      <div className="relative">
        <ModelSelector
          value={models?.base?.model || ''}
          onValueChange={(modelValue) => {
            updatePath('models.base.model', modelValue || undefined);
          }}
          inheritedValue={graphModels?.base?.model || projectModels?.base?.model}
          label={
            <div className="flex items-center gap-2">
              Base Model
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
          tooltip="Primary model for general agent responses"
        />
      </div>

      <Collapsible
        defaultOpen={!!hasAdvancedOptions}
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
              onValueChange={(modelValue) => {
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
              tooltip="The model used for structured output and data components (defaults to base model)"
            />
          </div>
          <div className="relative">
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
              tooltip="The model used for summarization tasks (defaults to base model)"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Base Model Provider Options */}
      {models?.base?.model && (
        <ExpandableJsonEditor
          name="base-provider-options"
          label="Base Model Provider Options"
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

      {/* Structured Output Model Provider Options */}
      {models?.structuredOutput?.model && (
        <ExpandableJsonEditor
          name="structured-provider-options"
          label="Structured Output Model Provider Options"
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

      {/* Summarizer Model Provider Options */}
      {models?.summarizer?.model && (
        <ExpandableJsonEditor
          name="summarizer-provider-options"
          label="Summarizer Model Provider Options"
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

      <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
          How model inheritance works:
        </p>
        <ul className="space-y-1 text-blue-800 dark:text-blue-200">
          <li>
            • <strong>Models</strong>: Project → Graph → Agent (partial inheritance - missing models
            only)
          </li>
          <li>
            • <strong>Individual model types</strong> inherit independently (base, structuredOutput,
            summarizer)
          </li>
          <li>
            • <strong>Explicit settings</strong> always take precedence over inherited values
          </li>
          <li>
            • <strong>Provider options</strong> are inherited along with the model if not explicitly
            set
          </li>
        </ul>
      </div>
    </div>
  );
}
