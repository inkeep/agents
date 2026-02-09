'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useController, useFormState, useWatch } from 'react-hook-form';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { ModelConfiguration } from '@/components/shared/model-configuration';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { summarizerModelProviderOptionsTemplate } from '@/lib/templates';
import { ModelInheritanceInfo } from './model-inheritance-info';
import type { ProjectFormData } from './validation';

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

function SummarizerModelSection({
  control,
  disabled,
}: {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}) {
  const { field: providerOptionsField } = useController({
    control,
    name: 'models.summarizer.providerOptions',
  });

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
            disabled={disabled}
          />
        )}
      </FormFieldWrapper>
      <div className="space-y-2">
        <FieldLabel id="models.summarizer.providerOptions" label="Provider options" />
        <StandaloneJsonEditor
          name="models.summarizer.providerOptions"
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
          placeholder={summarizerModelProviderOptionsTemplate}
          customTemplate={summarizerModelProviderOptionsTemplate}
          readOnly={disabled}
        />
      </div>
    </div>
  );
}

export function ProjectModelsSection({ control, disabled }: ProjectModelsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({ control });

  const hasModelsErrors = !!(
    errors.models?.base?.model ||
    errors.models?.base?.providerOptions ||
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
