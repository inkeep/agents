'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useController, useFormState, useWatch } from 'react-hook-form';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { ModelInheritanceInfo } from './model-inheritance-info';
import type { ProjectFormData } from './validation';

interface ProjectModelsSectionProps {
  control: Control<ProjectFormData>;
}

function BaseModelSection({ control }: { control: Control<ProjectFormData> }) {
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.base.providerOptions',
  });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        control={control}
        name="models.base.model"
        label="Base model"
        description="Primary model for general agent responses"
        isRequired
      >
        {(field) => (
          <ModelSelector
            label=""
            placeholder="Select base model"
            value={field.value || ''}
            onValueChange={field.onChange}
            canClear={false}
          />
        )}
      </FormFieldWrapper>
      <ExpandableJsonEditor
        name="models.base.providerOptions"
        label="Provider options"
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
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.structuredOutput.providerOptions',
  });

  // Get the base model to show as inherited value
  const baseModel = useWatch({ control, name: 'models.base.model' });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        control={control}
        name="models.structuredOutput.model"
        label="Structured output model"
        description="Model for structured outputs and components (defaults to base model)"
      >
        {(field) => (
          <ModelSelector
            label=""
            placeholder="Select structured output model (optional)"
            value={field.value || ''}
            onValueChange={field.onChange}
            inheritedValue={baseModel}
            canClear={true}
          />
        )}
      </FormFieldWrapper>
      <ExpandableJsonEditor
        name="models.structuredOutput.providerOptions"
        label="Provider options"
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
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.summarizer.providerOptions',
  });

  // Get the base model to show as inherited value
  const baseModel = useWatch({ control, name: 'models.base.model' });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        control={control}
        name="models.summarizer.model"
        label="Summarizer model"
        description="Model for summarization tasks (defaults to base model)"
      >
        {(field) => (
          <ModelSelector
            label=""
            placeholder="Select summarizer model (optional)"
            value={field.value || ''}
            onValueChange={field.onChange}
            inheritedValue={baseModel}
            canClear={true}
          />
        )}
      </FormFieldWrapper>
      <ExpandableJsonEditor
        name="models.summarizer.providerOptions"
        label="Provider options"
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
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({ control });

  const hasModelsErrors = !!(
    errors.models?.base?.model ||
    errors.models?.base?.providerOptions ||
    errors.models?.structuredOutput?.model ||
    errors.models?.structuredOutput?.providerOptions ||
    errors.models?.summarizer?.model ||
    errors.models?.summarizer?.providerOptions
  );

  // Auto-open the collapsible when there are errors in the models section
  useEffect(() => {
    if (hasModelsErrors) {
      setIsOpen(true);
    }
  }, [hasModelsErrors]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Default models</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Set default models that will be inherited by agents and sub agents in this project.
        </p>
      </div>

      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="border rounded-md bg-background"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group p-0 h-auto  hover:!bg-transparent transition-colors py-2 px-4"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure default models
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6  mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          {/* Base Model */}
          <BaseModelSection control={control} />

          {/* Structured Output Model */}
          <StructuredOutputModelSection control={control} />

          {/* Summarizer Model */}
          <SummarizerModelSection control={control} />
          <InfoCard title="How model inheritance works:" Icon={Info}>
            <ModelInheritanceInfo />
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
