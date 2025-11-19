'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Control, useController, useFormState, useWatch } from 'react-hook-form';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import type { DatasetItemFormData } from './validation';

interface SimulationAgentFormProps {
  control: Control<DatasetItemFormData>;
}

export function SimulationAgentForm({ control }: SimulationAgentFormProps) {
  const simulationAgent = useWatch({ control, name: 'simulationAgent' });
  const hasConfigured = !!(
    simulationAgent &&
    typeof simulationAgent === 'object' &&
    simulationAgent !== null &&
    !Array.isArray(simulationAgent) &&
    (simulationAgent.prompt || simulationAgent.model)
  );
  const [isOpen, setIsOpen] = useState(hasConfigured);

  const { errors } = useFormState({ control });
  const simulationAgentError = errors.simulationAgent;
  const modelError =
    simulationAgentError &&
    typeof simulationAgentError === 'object' &&
    'model' in simulationAgentError &&
    simulationAgentError.model &&
    typeof simulationAgentError.model === 'object' &&
    'model' in simulationAgentError.model &&
    simulationAgentError.model.model;

  const promptError =
    simulationAgentError &&
    typeof simulationAgentError === 'object' &&
    'prompt' in simulationAgentError &&
    simulationAgentError.prompt;

  const hasErrors = !!modelError || !!promptError;

  useEffect(() => {
    if (hasErrors) {
      setIsOpen(true);
    }
  }, [hasErrors]);

  const { field: providerOptionsField } = useController({
    control,
    name: 'simulationAgent.model.providerOptions',
    defaultValue: undefined,
  });

  // Handle the case where simulationAgent might be a string (legacy JSON)
  const isStringMode = typeof simulationAgent === 'string';

  if (isStringMode) {
    // Fallback to JSON editor if it's a string
    return (
      <FormFieldWrapper control={control} name="simulationAgent" label="Simulation Agent">
        {(field) => (
          <div className="space-y-2">
            <ExpandableJsonEditor
              name="simulationAgent"
              value={field.value || ''}
              onChange={field.onChange}
              placeholder={`{
  "prompt": "You are a helpful assistant",
  "model": {
    "model": "gpt-4"
  },
  "stopWhen": {}
}`}
            />
            <p className="text-xs text-muted-foreground">
              Configuration for simulating a multi-turn conversation (optional)
            </p>
          </div>
        )}
      </FormFieldWrapper>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Simulation Agent Definition</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration for simulating a multi-turn conversation (optional)
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
            Configure Simulation Agent
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          {/* Prompt */}
          <GenericTextarea
            control={control}
            name="simulationAgent.prompt"
            label="Prompt"
            placeholder="You are a helpful assistant"
            className="min-h-[100px]"
            isRequired
          />

          {/* Model */}
          <div className="space-y-4">
            <FormFieldWrapper
              control={control}
              name="simulationAgent.model.model"
              label="Model"
              description="AI model to use for the simulation agent"
              isRequired
            >
              {(field) => (
                <ModelSelector
                  label=""
                  placeholder="Select model"
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  canClear={false}
                />
              )}
            </FormFieldWrapper>

            {/* Provider Options */}
            <ExpandableJsonEditor
              name="simulationAgent.model.providerOptions"
              label="Provider options"
              value={
                providerOptionsField.value
                  ? JSON.stringify(providerOptionsField.value, null, 2)
                  : ''
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
  "maxOutputTokens": 2048
}`}
            />
          </div>

          {/* Stop When */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Execution Limits (Optional)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GenericInput
                control={control}
                name="simulationAgent.stopWhen.transferCountIs"
                description="Maximum number of agent transfers"
                label="Max transfers"
                type="number"
                placeholder="10"
                min="1"
              />

              <GenericInput
                control={control}
                name="simulationAgent.stopWhen.stepCountIs"
                label="Max steps"
                type="number"
                placeholder="50"
                min="1"
                description="Maximum number of execution steps"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
