'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type UseFormReturn, useController, useFormState, useWatch } from 'react-hook-form';
import { CollapsibleSettings } from '@/components/agent/sidepane/collapsible-settings';
import { SectionHeader } from '@/components/agent/sidepane/section';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import {
  type ProjectInput,
  type ProjectOutput,
  ProjectSchema,
} from '@/components/projects/form/validation';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { InfoCard } from '@/components/ui/info-card';
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
  const { control } = form;
  const baseModel = useWatch({ control, name: 'models.base.model' });
  const { field: fallbackModelsField } = useController({
    control,
    name: 'models.base.fallbackModels',
  });
  const { field: allowedProvidersField } = useController({
    control,
    name: 'models.base.allowedProviders',
  });
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
            fallbackModels={fallbackModelsField.value ?? undefined}
            onFallbackModelsChange={(models) => {
              fallbackModelsField.onChange(models.length ? models : undefined);
            }}
            allowedProviders={allowedProvidersField.value ?? undefined}
            onAllowedProvidersChange={(providers) => {
              allowedProvidersField.onChange(providers.length ? providers : undefined);
            }}
          />
        )}
      </FormFieldWrapper>
    </div>
  );
}

function StructuredOutputModelSection({ form, disabled }: ProjectModelsSectionProps) {
  const { control } = form;
  const structuredOutputModel = useWatch({
    control: form.control,
    name: 'models.structuredOutput.model',
  });
  const { field: fallbackModelsField } = useController({
    control,
    name: 'models.structuredOutput.fallbackModels',
  });
  const { field: allowedProvidersField } = useController({
    control,
    name: 'models.structuredOutput.allowedProviders',
  });
  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({
    control,
    name: 'models.base.providerOptions',
  });
  const baseFallbackModels = useWatch({ control, name: 'models.base.fallbackModels' });
  const baseAllowedProviders = useWatch({ control, name: 'models.base.allowedProviders' });

  return (
    <FormFieldWrapper
      label=""
      control={control}
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
            if (value) {
              form.setValue('models.structuredOutput.model', value, { shouldDirty: true });
            } else {
              form.unregister('models.structuredOutput');
            }
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
          fallbackModels={fallbackModelsField.value ?? undefined}
          inheritedFallbackModels={baseFallbackModels ?? undefined}
          onFallbackModelsChange={(models) => {
            fallbackModelsField.onChange(models.length ? models : undefined);
          }}
          allowedProviders={allowedProvidersField.value ?? undefined}
          inheritedAllowedProviders={baseAllowedProviders ?? undefined}
          onAllowedProvidersChange={(providers) => {
            allowedProvidersField.onChange(providers.length ? providers : undefined);
          }}
        />
      )}
    </FormFieldWrapper>
  );
}

function SummarizerModelSection({ form, disabled }: ProjectModelsSectionProps) {
  const { control } = form;
  const summarizerModel = useWatch({ control, name: 'models.summarizer.model' });
  const { field: fallbackModelsField } = useController({
    control,
    name: 'models.summarizer.fallbackModels',
  });
  const { field: allowedProvidersField } = useController({
    control,
    name: 'models.summarizer.allowedProviders',
  });
  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({
    control,
    name: 'models.base.providerOptions',
  });
  const baseFallbackModels = useWatch({ control, name: 'models.base.fallbackModels' });
  const baseAllowedProviders = useWatch({ control, name: 'models.base.allowedProviders' });

  return (
    <FormFieldWrapper
      label=""
      control={control}
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
            if (value) {
              form.setValue('models.summarizer.model', value, { shouldDirty: true });
            } else {
              form.unregister('models.summarizer');
            }
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
          fallbackModels={fallbackModelsField.value ?? undefined}
          inheritedFallbackModels={baseFallbackModels ?? undefined}
          onFallbackModelsChange={(models) => {
            fallbackModelsField.onChange(models.length ? models : undefined);
          }}
          allowedProviders={allowedProvidersField.value ?? undefined}
          inheritedAllowedProviders={baseAllowedProviders ?? undefined}
          onAllowedProvidersChange={(providers) => {
            allowedProvidersField.onChange(providers.length ? providers : undefined);
          }}
        />
      )}
    </FormFieldWrapper>
  );
}

export function ProjectModelsSection({ form, disabled }: ProjectModelsSectionProps) {
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
      <SectionHeader
        title="Default models"
        description="Set default models that will be inherited by agents and sub agents in this project."
      />
      <CollapsibleSettings open={isOpen} onOpenChange={setIsOpen} title="Configure default models">
        {/* Base Model */}
        <BaseModelSection form={form} disabled={disabled} />
        {/* Structured Output Model */}
        <StructuredOutputModelSection form={form} disabled={disabled} />
        {/* Summarizer Model */}
        <SummarizerModelSection form={form} disabled={disabled} />
        <InfoCard title="How model inheritance works:" Icon={Info}>
          <ModelInheritanceInfo />
        </InfoCard>
      </CollapsibleSettings>
    </div>
  );
}
