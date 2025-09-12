'use client';

import { ChevronRight } from 'lucide-react';
import { type Control, useController, useWatch } from 'react-hook-form';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { ModelSelector } from '@/components/graph/sidepane/nodes/model-selector';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import type { ProjectFormData } from './validation';

interface ProjectModelsSectionProps {
  control: Control<ProjectFormData>;
}

function BaseModelSection({ control }: { control: Control<ProjectFormData> }) {
  const { field: modelField } = useController({
    control,
    name: 'models.base.model',
  });
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.base.providerOptions',
  });

  return (
    <div className="space-y-2">
      <ModelSelector
        label="Base Model"
        placeholder="Select base model"
        value={modelField.value || ''}
        onValueChange={modelField.onChange}
        isRequired
        canClear={false}
      />
      <p className="text-xs text-muted-foreground">Primary model for general agent responses</p>
      <ExpandableJsonEditor
        name="models.base.providerOptions"
        label="Provider Options"
        value={
          providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
        }
        onChange={(value) => {
          if (!value?.trim()) {
            providerOptionsField.onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(value);
            providerOptionsField.onChange(parsed);
          } catch {
            // Invalid JSON - don't update the field value
          }
        }}
        placeholder={`{
  "temperature": 0.7,
  "maxTokens": 2048
}`}
      />
    </div>
  );
}

function StructuredOutputModelSection({ control }: { control: Control<ProjectFormData> }) {
  const { field: modelField } = useController({
    control,
    name: 'models.structuredOutput.model',
  });
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.structuredOutput.providerOptions',
  });

  // Get the base model to show as inherited value
  const baseModel = useWatch({ control, name: 'models.base.model' });

  return (
    <div className="space-y-2">
      <ModelSelector
        label="Structured Output Model"
        placeholder="Select structured output model (optional)"
        value={modelField.value || ''}
        onValueChange={modelField.onChange}
        inheritedValue={baseModel}
        canClear={true}
      />
      <p className="text-xs text-muted-foreground">
        Model for structured outputs and data components (defaults to base model)
      </p>
      <ExpandableJsonEditor
        name="models.structuredOutput.providerOptions"
        label="Provider Options"
        value={
          providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
        }
        onChange={(value) => {
          if (!value?.trim()) {
            providerOptionsField.onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(value);
            providerOptionsField.onChange(parsed);
          } catch {
            // Invalid JSON - don't update the field value
          }
        }}
        placeholder={`{
  "temperature": 0.1,
  "maxTokens": 1024
}`}
      />
    </div>
  );
}

function SummarizerModelSection({ control }: { control: Control<ProjectFormData> }) {
  const { field: modelField } = useController({
    control,
    name: 'models.summarizer.model',
  });
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.summarizer.providerOptions',
  });

  // Get the base model to show as inherited value
  const baseModel = useWatch({ control, name: 'models.base.model' });

  return (
    <div className="space-y-2">
      <ModelSelector
        label="Summarizer Model"
        placeholder="Select summarizer model (optional)"
        value={modelField.value || ''}
        onValueChange={modelField.onChange}
        inheritedValue={baseModel}
        canClear={true}
      />
      <p className="text-xs text-muted-foreground">
        Model for summarization tasks (defaults to base model)
      </p>
      <ExpandableJsonEditor
        name="models.summarizer.providerOptions"
        label="Provider Options"
        value={
          providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
        }
        onChange={(value) => {
          if (!value?.trim()) {
            providerOptionsField.onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(value);
            providerOptionsField.onChange(parsed);
          } catch {
            // Invalid JSON - don't update the field value
          }
        }}
        placeholder={`{
  "temperature": 0.3,
  "maxTokens": 1024
}`}
      />
    </div>
  );
}

export function ProjectModelsSection({ control }: ProjectModelsSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Default Models</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Set default models that will be inherited by graphs and agents in this project
        </p>
      </div>

      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure Default Models
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 mt-4 border rounded-md p-4 bg-muted/30">
          {/* Base Model */}
          <BaseModelSection control={control} />

          {/* Structured Output Model */}
          <StructuredOutputModelSection control={control} />

          {/* Summarizer Model */}
          <SummarizerModelSection control={control} />

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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
