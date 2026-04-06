'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useFormState, useWatch } from 'react-hook-form';
import { CollapsibleSettings } from '@/components/agent/sidepane/collapsible-settings';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { ModelInheritanceInfo } from './model-inheritance-info';
import type { ProjectFormData, ProjectFormInputValues } from './validation';

type ProjectFormControl = Control<ProjectFormInputValues, unknown, ProjectFormData>;

interface ProjectModelsSectionProps {
  control: ProjectFormControl;
  disabled?: boolean;
}

function BaseModelSection({
  control,
  disabled,
}: {
  control: ProjectFormControl;
  disabled?: boolean;
}) {
  return <ModelConfiguration control={control} name="models.base" disabled={disabled} />;
}

function StructuredOutputModelSection({
  control,
  disabled,
}: {
  control: ProjectFormControl;
  disabled?: boolean;
}) {
  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({ control, name: 'models.base.providerOptions' });
  const baseFallbackModels = useWatch({ control, name: 'models.base.fallbackModels' });
  const baseAllowedProviders = useWatch({ control, name: 'models.base.allowedProviders' });

  return (
    <ModelConfiguration
      control={control}
      name="models.structuredOutput"
      inherited={{
        model: baseModel,
        providerOptions: baseProviderOptions,
        fallbackModels: baseFallbackModels ?? undefined,
        allowedProviders: baseAllowedProviders ?? undefined,
      }}
      disabled={disabled}
    />
  );
}

function SummarizerModelSection({
  control,
  disabled,
}: {
  control: ProjectFormControl;
  disabled?: boolean;
}) {
  const baseModel = useWatch({ control, name: 'models.base.model' });
  const baseProviderOptions = useWatch({ control, name: 'models.base.providerOptions' });
  const baseFallbackModels = useWatch({ control, name: 'models.base.fallbackModels' });
  const baseAllowedProviders = useWatch({ control, name: 'models.base.allowedProviders' });

  return (
    <ModelConfiguration
      control={control}
      name="models.summarizer"
      inherited={{
        model: baseModel,
        providerOptions: baseProviderOptions,
        fallbackModels: baseFallbackModels ?? undefined,
        allowedProviders: baseAllowedProviders ?? undefined,
      }}
      disabled={disabled}
    />
  );
}

export function ProjectModelsSection({ control, disabled }: ProjectModelsSectionProps) {
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

      <CollapsibleSettings open={isOpen} onOpenChange={setIsOpen} title="Configure default models">
        {/* Base Model */}
        <BaseModelSection control={control} disabled={disabled} />

        {/* Structured Output Model */}
        <StructuredOutputModelSection control={control} disabled={disabled} />

        {/* Summarizer Model */}
        <SummarizerModelSection control={control} disabled={disabled} />
        <InfoCard title="How model inheritance works:" Icon={Info}>
          <ModelInheritanceInfo />
        </InfoCard>
      </CollapsibleSettings>
    </div>
  );
}
