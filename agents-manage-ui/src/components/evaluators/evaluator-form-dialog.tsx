'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ModelSelector } from '@/components/agent/sidepane/nodes/model-selector';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { createEvaluatorAction, updateEvaluatorAction } from '@/lib/actions/evaluators';
import type { ActionResult } from '@/lib/actions/types';
import type { Evaluator } from '@/lib/api/evaluators';
import { PassCriteriaBuilder } from './pass-criteria-builder';
import { type EvaluatorFormData, evaluatorSchema } from './validation';

interface EvaluatorFormDialogProps {
  tenantId: string;
  projectId: string;
  evaluatorId?: string;
  initialData?: Evaluator;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const formatFormData = (data?: Evaluator): EvaluatorFormData => {
  if (!data) {
    return {
      name: '',
      description: '',
      prompt: '',
      schema: '{}',
      model: {
        model: '',
        providerOptions: undefined,
      },
      passCriteria: undefined,
    };
  }

  return {
    name: data.name || '',
    description: data.description || '',
    prompt: data.prompt || '',
    schema: JSON.stringify(data.schema || {}, null, 2),
    model: {
      model: data.model?.model || '',
      providerOptions: data.model?.providerOptions,
    },
    passCriteria: data.passCriteria,
  };
};

export function EvaluatorFormDialog({
  tenantId,
  projectId,
  evaluatorId,
  initialData,
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
}: EvaluatorFormDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;
  const form = useForm<EvaluatorFormData>({
    resolver: zodResolver(evaluatorSchema),
    defaultValues: formatFormData(initialData),
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(formatFormData(initialData));
    }
  }, [isOpen, initialData, form]);

  const { isSubmitting } = form.formState;

  const { field: providerOptionsField } = useController({
    control: form.control,
    name: 'model.providerOptions',
    defaultValue: undefined,
  });

  const { field: passCriteriaField } = useController({
    control: form.control,
    name: 'passCriteria',
    defaultValue: undefined,
  });

  const { field: schemaField } = useController({
    control: form.control,
    name: 'schema',
  });

  const onSubmit = async (data: EvaluatorFormData) => {
    const isValid = await form.trigger();
    if (!isValid) {
      const firstError = Object.keys(form.formState.errors)[0];
      if (firstError) {
        const errorElement = document
          .querySelector(`[name="${firstError}"]`)
          ?.closest('.space-y-4, .space-y-6');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    try {
      let parsedSchema: Record<string, unknown>;
      try {
        parsedSchema = JSON.parse(data.schema);
      } catch {
        toast.error('Schema must be valid JSON');
        return;
      }

      const payload = {
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        schema: parsedSchema,
        model: {
          model: data.model.model,
          ...(data.model.providerOptions && {
            providerOptions: data.model.providerOptions,
          }),
        },
        ...(data.passCriteria && { passCriteria: data.passCriteria }),
      };

      let result: ActionResult<Evaluator>;
      if (evaluatorId) {
        result = await updateEvaluatorAction(tenantId, projectId, evaluatorId, payload);
        if (result.success) {
          toast.success('Evaluator updated');
        } else {
          toast.error(result.error || 'Failed to update evaluator');
          return;
        }
      } else {
        result = await createEvaluatorAction(tenantId, projectId, payload);
        if (result.success) {
          toast.success('Evaluator created');
        } else {
          toast.error(result.error || 'Failed to create evaluator');
          return;
        }
      }

      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error submitting evaluator:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{evaluatorId ? 'Edit Evaluator' : 'Create Evaluator'}</DialogTitle>
          <DialogDescription>
            Configure an evaluator with a prompt, output schema, and model settings for evaluating
            agent conversations.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="e.g., Quality Check Evaluator"
              isRequired
            />

            <GenericTextarea
              control={form.control}
              name="description"
              label="Description"
              placeholder="Describe what this evaluator measures..."
              isRequired
            />

            <FormFieldWrapper
              control={form.control}
              name="prompt"
              label="Prompt"
              description="Instructions for the evaluator LLM on how to evaluate conversations"
              isRequired
            >
              {(field) => (
                <Textarea
                  placeholder="You are an evaluator. Analyze the conversation and provide feedback..."
                  className="min-h-[150px] font-mono text-sm"
                  {...field}
                  value={field.value ?? ''}
                />
              )}
            </FormFieldWrapper>

            <JsonSchemaInput
              control={form.control}
              name="schema"
              label="Output Schema"
              description="JSON Schema defining the structure of the evaluation output. Use standard JSON Schema format."
              isRequired
              placeholder={`{
  "type": "object",
  "properties": {
    "clarity": {
      "type": "number",
      "minimum": 0,
      "maximum": 10,
      "description": "How clear and understandable the responses were"
    },
    "helpfulness": {
      "type": "number",
      "minimum": 0,
      "maximum": 10,
      "description": "How helpful the agent was in addressing user needs"
    },
    "professionalism": {
      "type": "number",
      "minimum": 0,
      "maximum": 10,
      "description": "How professional and appropriate the tone was"
    },
    "efficiency": {
      "type": "number",
      "minimum": 0,
      "maximum": 10,
      "description": "How efficiently the agent completed the task"
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Any issues or problems in the conversation"
    }
  },
  "required": ["clarity", "helpfulness", "professionalism", "efficiency"]
}`}
            />

            <div className="space-y-4">
              <FormFieldWrapper
                control={form.control}
                name="model.model"
                label="Model"
                description="AI model to use for the evaluator"
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

              <ExpandableJsonEditor
                name="model.providerOptions"
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

            <PassCriteriaBuilder
              value={passCriteriaField.value}
              onChange={passCriteriaField.onChange}
              schema={(() => {
                try {
                  return JSON.parse(schemaField.value || '{}');
                } catch {
                  return {};
                }
              })()}
              disabled={isSubmitting}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {evaluatorId ? 'Update' : 'Create'} Evaluator
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
