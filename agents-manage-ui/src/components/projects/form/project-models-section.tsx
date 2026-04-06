'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useFormState, useWatch } from 'react-hook-form';
import { CollapsibleSettings } from '@/components/agent/sidepane/collapsible-settings';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from '@/lib/templates';
import { ModelInheritanceInfo } from './model-inheritance-info';
import type { ProjectFormData, ProjectFormInputValues } from './validation';

type ProjectFormControl = Control<ProjectFormInputValues, unknown, ProjectFormData>;

interface ProjectModelsSectionProps {
  control: ProjectFormControl;
  disabled?: boolean;
}

type BaseModelSettings = ProjectFormInputValues['models']['base'];

function BaseModelSection({
  control,
  disabled,
}: {
  control: ProjectFormControl;
  disabled?: boolean;
}) {
  return (
    <ModelConfiguration
      control={control}
      name="models.base"
      label="Base model"
      description="Primary model for general agent responses"
      placeholder="Select base model"
      canClear={false}
      isRequired
      editorNamePrefix="project-base"
      disabled={disabled}
    />
  );
}

function StructuredOutputModelSection({
  control,
  base,
  disabled,
}: {
  control: ProjectFormControl;
  base: BaseModelSettings;
  disabled?: boolean;
}) {
  return (
    <ModelConfiguration
      control={control}
      name="models.structuredOutput"
      label="Structured output model"
      description="Model for structured outputs and components (defaults to base model)"
      placeholder="Select structured output model (optional)"
      inheritedValue={base.model}
      inheritedProviderOptions={base.providerOptions}
      canClear={!disabled}
      editorNamePrefix="project-structured"
      getJsonPlaceholder={(model) => {
        if (model?.startsWith('azure/')) {
          return azureModelProviderOptionsTemplate;
        }
        return structuredOutputModelProviderOptionsTemplate;
      }}
      disabled={disabled}
      inheritedFallbackModels={base.fallbackModels ?? undefined}
      inheritedAllowedProviders={base.allowedProviders ?? undefined}
    />
  );
}

function SummarizerModelSection({
  control,
  base,
  disabled,
}: {
  control: ProjectFormControl;
  base: BaseModelSettings;
  disabled?: boolean;
}) {
  return (
    <ModelConfiguration
      control={control}
      name="models.summarizer"
      label="Summarizer model"
      description="Model for summarization tasks (defaults to base model)"
      placeholder="Select summarizer model (optional)"
      inheritedValue={base.model}
      inheritedProviderOptions={base.providerOptions}
      canClear
      editorNamePrefix="project-summarizer"
      getJsonPlaceholder={(model) => {
        if (model?.startsWith('azure/')) {
          return azureModelSummarizerProviderOptionsTemplate;
        }
        return summarizerModelProviderOptionsTemplate;
      }}
      disabled={disabled}
      inheritedFallbackModels={base.fallbackModels ?? undefined}
      inheritedAllowedProviders={base.allowedProviders ?? undefined}
    />
  );
}

export function ProjectModelsSection({ control, disabled }: ProjectModelsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({ control });
  const base = useWatch({ control, name: 'models.base' });

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

      <CollapsibleSettings open={isOpen} onOpenChange={setIsOpen} title="Configure default models">
        {/* Base Model */}
        <BaseModelSection control={control} disabled={disabled} />

        {/* Structured Output Model */}
        <StructuredOutputModelSection control={control} base={base} disabled={disabled} />

        {/* Summarizer Model */}
        <SummarizerModelSection control={control} base={base} disabled={disabled} />
        <InfoCard title="How model inheritance works:" Icon={Info}>
          <ModelInheritanceInfo />
        </InfoCard>
      </CollapsibleSettings>
    </div>
  );
}
