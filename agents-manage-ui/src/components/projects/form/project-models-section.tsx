'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useController, useFormState, useWatch } from 'react-hook-form';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { type ProjectFormData, ProjectSchema } from '@/components/projects/form/validation';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { isRequired } from '@/lib/utils';
import { ModelInheritanceInfo } from './model-inheritance-info';

interface ProjectModelsSectionProps {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}

function BaseModelSection({
  control,
  disabled,
}: {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}) {
  'use memo';
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
        isRequired={isRequired(ProjectSchema, 'models.base.model')}
      >
        {(field) => (
          <ModelConfiguration
            value={field.value || ''}
            providerOptions={
              providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
            }
            label=""
            placeholder="Select base model"
            canClear={false}
            isRequired={true}
            onModelChange={field.onChange}
            onProviderOptionsChange={(value) => {
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
            editorNamePrefix="project-base"
            disabled={disabled}
          />
        )}
      </FormFieldWrapper>
    </div>
  );
}

function StructuredOutputModelSection({
  control,
  disabled,
}: {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}) {
  'use memo';
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.structuredOutput.providerOptions',
  });

  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({ control, name: 'models.base.providerOptions' });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        control={control}
        name="models.structuredOutput.model"
        isRequired={isRequired(ProjectSchema, 'models.structuredOutput.model')}
        label="Structured output model"
        description="Model for structured outputs and components (defaults to base model)"
      >
        {(field) => (
          <ModelConfiguration
            value={field.value || ''}
            providerOptions={
              providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
            }
            label=""
            placeholder="Select structured output model (optional)"
            inheritedValue={baseModel}
            inheritedProviderOptions={
              baseProviderOptions ? JSON.stringify(baseProviderOptions, null, 2) : undefined
            }
            canClear={!disabled}
            onModelChange={field.onChange}
            onProviderOptionsChange={(value) => {
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
            editorNamePrefix="project-structured"
            getJsonPlaceholder={(model) => {
              if (model?.startsWith('azure/')) {
                return azureModelProviderOptionsTemplate;
              }
              return structuredOutputModelProviderOptionsTemplate;
            }}
            disabled={disabled}
          />
        )}
      </FormFieldWrapper>
    </div>
  );
}

function SummarizerModelSection({
  control,
  disabled,
}: {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}) {
  'use memo';
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.summarizer.providerOptions',
  });

  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({ control, name: 'models.base.providerOptions' });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        control={control}
        name="models.summarizer.model"
        isRequired={isRequired(ProjectSchema, 'models.summarizer.model')}
        label="Summarizer model"
        description="Model for summarization tasks (defaults to base model)"
      >
        {(field) => (
          <ModelConfiguration
            value={field.value || ''}
            providerOptions={
              providerOptionsField.value ? JSON.stringify(providerOptionsField.value, null, 2) : ''
            }
            label=""
            placeholder="Select summarizer model (optional)"
            inheritedValue={baseModel}
            inheritedProviderOptions={
              baseProviderOptions ? JSON.stringify(baseProviderOptions, null, 2) : undefined
            }
            canClear={true}
            onModelChange={field.onChange}
            onProviderOptionsChange={(value) => {
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
            editorNamePrefix="project-summarizer"
            getJsonPlaceholder={(model) => {
              if (model?.startsWith('azure/')) {
                return azureModelSummarizerProviderOptionsTemplate;
              }
              return summarizerModelProviderOptionsTemplate;
            }}
            disabled={disabled}
          />
        )}
      </FormFieldWrapper>
    </div>
  );
}

export function ProjectModelsSection({ control, disabled }: ProjectModelsSectionProps) {
  'use memo';
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
            className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure default models
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6  mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          {/* Base Model */}
          <BaseModelSection control={control} disabled={disabled} />

          {/* Structured Output Model */}
          <StructuredOutputModelSection control={control} disabled={disabled} />

          {/* Summarizer Model */}
          <SummarizerModelSection control={control} disabled={disabled} />
          <InfoCard title="How model inheritance works:" Icon={Info}>
            <ModelInheritanceInfo />
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
