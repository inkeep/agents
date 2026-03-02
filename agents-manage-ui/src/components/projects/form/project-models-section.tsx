'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type UseFormReturn, useFormState, useWatch } from 'react-hook-form';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import {
  type ProjectInput,
  type ProjectOutput,
  ProjectSchema,
} from '@/components/projects/form/validation';
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
  form: UseFormReturn<ProjectInput, unknown, ProjectOutput>;
  disabled?: boolean;
}

function BaseModelSection({ form, disabled }: ProjectModelsSectionProps) {
  'use memo';
  const baseModel = useWatch({ control: form.control, name: 'models.base.model' });

  return (
    <div className="space-y-4">
      <FormFieldWrapper
        label=""
        control={form.control}
        // Show validation errors of provider options editor
        name="models.base.providerOptions"
        description="Primary model for general agent responses"
      >
        {(field) => (
          <ModelConfiguration
            value={baseModel}
            providerOptions={field.value}
            label="Base model"
            isRequired={isRequired(ProjectSchema, 'models.base.model')}
            placeholder="Select base model"
            canClear={false}
            onModelChange={(value) => {
              form.setValue('models.base.model', value, { shouldDirty: true });
            }}
            onProviderOptionsChange={field.onChange}
            editorNamePrefix="project-base"
            disabled={disabled}
          />
        )}
      </FormFieldWrapper>
    </div>
  );
}

function StructuredOutputModelSection({ form, disabled }: ProjectModelsSectionProps) {
  'use memo';
  const structuredOutputModel = useWatch({
    control: form.control,
    name: 'models.structuredOutput.model',
  });
  const baseModel = useWatch({ control: form.control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({
    control: form.control,
    name: 'models.base.providerOptions',
  });

  return (
    <FormFieldWrapper
      label=""
      control={form.control}
      // Show validation errors of provider options editor
      name="models.structuredOutput.providerOptions"
      description="Model for structured outputs and components (defaults to base model)"
    >
      {(field) => (
        <ModelConfiguration
          value={structuredOutputModel || ''}
          providerOptions={field.value}
          label="Structured output model"
          isRequired={isRequired(ProjectSchema, 'models.structuredOutput.model')}
          placeholder="Select structured output model (optional)"
          inheritedValue={baseModel}
          inheritedProviderOptions={baseProviderOptions}
          canClear={!disabled}
          onModelChange={(value) => {
            form.setValue('models.structuredOutput.model', value, { shouldDirty: true });
          }}
          onProviderOptionsChange={field.onChange}
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
  );
}

function SummarizerModelSection({ form, disabled }: ProjectModelsSectionProps) {
  'use memo';
  const summarizerModel = useWatch({ control: form.control, name: 'models.summarizer.model' });
  const baseModel = useWatch({ control: form.control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({
    control: form.control,
    name: 'models.base.providerOptions',
  });

  return (
    <FormFieldWrapper
      label=""
      control={form.control}
      // Show validation errors of provider options editor
      name="models.summarizer.providerOptions"
      description="Model for summarization tasks (defaults to base model)"
    >
      {(field) => (
        <ModelConfiguration
          value={summarizerModel ?? ''}
          providerOptions={field.value}
          isRequired={isRequired(ProjectSchema, 'models.summarizer.model')}
          label="Summarizer model"
          placeholder="Select summarizer model (optional)"
          inheritedValue={baseModel}
          inheritedProviderOptions={baseProviderOptions}
          canClear
          onModelChange={(value) => {
            form.setValue('models.summarizer.model', value, { shouldDirty: true });
          }}
          onProviderOptionsChange={field.onChange}
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
  );
}

export function ProjectModelsSection({ form, disabled }: ProjectModelsSectionProps) {
  'use memo';
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({ control: form.control });

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
          <BaseModelSection form={form} disabled={disabled} />
          {/* Structured Output Model */}
          <StructuredOutputModelSection form={form} disabled={disabled} />
          {/* Summarizer Model */}
          <SummarizerModelSection form={form} disabled={disabled} />
          <InfoCard title="How model inheritance works:" Icon={Info}>
            <ModelInheritanceInfo />
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
