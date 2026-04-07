'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useFormState, useWatch } from 'react-hook-form';
import { CollapsibleSettings } from '@/components/agent/sidepane/collapsible-settings';
import { SectionHeader } from '@/components/agent/sidepane/section';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { InfoCard } from '@/components/ui/info-card';
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
      canClear={false}
      isRequired
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
      inherited={{
        model: base.model,
        providerOptions: base.providerOptions,
        fallbackModels: base.fallbackModels,
        allowedProviders: base.allowedProviders,
      }}
      disabled={disabled}
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
      inherited={{
        model: base.model,
        providerOptions: base.providerOptions,
        fallbackModels: base.fallbackModels,
        allowedProviders: base.allowedProviders,
      }}
      disabled={disabled}
    />
  );
}

export function ProjectModelsSection({ control, disabled }: ProjectModelsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({ control });
  const base = useWatch({ control, name: 'models.base' });
  const hasModelsErrors = !!errors.models;

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
