'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { GenericInput } from '@/components/form/generic-input';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

const toolSchemaTemplate = `{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The search query"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results"
    }
  },
  "required": ["query"]
}`;

const toolOverrideSchema = z.object({
  displayName: z
    .string()
    .max(100, 'Display name must be less than 100 characters')
    .refine((val) => !val.trim() || /^[a-zA-Z0-9_-]+$/.test(val.trim()), {
      message: 'Display name can only contain letters, numbers, hyphens, and underscores',
    })
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .or(z.literal('')),
  schema: z
    .string()
    .refine(
      (val) => {
        if (!val.trim()) return true;
        try {
          const parsed = JSON.parse(val);
          if (typeof parsed !== 'object' || parsed === null) return false;
          if (
            parsed.type &&
            !['string', 'number', 'boolean', 'object', 'array'].includes(parsed.type)
          ) {
            return false;
          }
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Schema must be a valid JSON object with a valid type' }
    )
    .optional()
    .or(z.literal('')),
});

type ToolOverrideFormData = z.infer<typeof toolOverrideSchema>;

interface ToolOverrideDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  override?: {
    displayName?: string;
    description?: string;
    schema?: unknown;
    transformation?: string | Record<string, string>;
  };
  onSave: (override: {
    displayName?: string;
    description?: string;
    schema?: unknown;
    transformation?: string | Record<string, string>;
  }) => void;
  originalTool?: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
}

const formatFormData = (override?: ToolOverrideDialogProps['override']): ToolOverrideFormData => {
  return {
    displayName: override?.displayName || '',
    description: override?.description || '',
    schema: override?.schema ? JSON.stringify(override.schema, null, 2) : '',
  };
};

export function ToolOverrideDialog({
  isOpen,
  onOpenChange,
  toolName,
  override,
  onSave,
  originalTool,
}: ToolOverrideDialogProps) {
  const form = useForm<ToolOverrideFormData>({
    resolver: zodResolver(toolOverrideSchema),
    defaultValues: formatFormData(override),
  });

  // Only reset when dialog opens, not when override reference changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (isOpen) {
      form.reset(formatFormData(override));
    }
  }, [isOpen]);

  const { isSubmitting } = form.formState;

  const onSubmit = (data: ToolOverrideFormData) => {
    const newOverride = {
      ...(data.displayName?.trim() && { displayName: data.displayName.trim() }),
      ...(data.description?.trim() && { description: data.description.trim() }),
      ...(data.schema?.trim() && {
        schema: (() => {
          try {
            return JSON.parse(data.schema);
          } catch {
            return data.schema;
          }
        })(),
      }),
      ...(override?.transformation && {
        transformation: override.transformation,
      }),
    };

    onSave(newOverride);
    onOpenChange(false);
  };

  const hasChanges =
    form.watch('displayName')?.trim() ||
    form.watch('description')?.trim() ||
    form.watch('schema')?.trim();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw]! max-w-6xl! max-h-[90vh] overflow-y-auto h-auto!">
        <DialogHeader>
          <DialogTitle>Override Tool: {toolName}</DialogTitle>
          <DialogDescription>
            Customize how this tool appears and behaves in your agent.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-8"
          >
            <GenericInput
              control={form.control}
              name="displayName"
              label="Display Name"
              placeholder={originalTool?.name || toolName}
              description="Override the tool name shown to the agent"
            />

            <FormFieldWrapper
              control={form.control}
              name="description"
              label="Description"
              description="Override the tool description shown to the agent"
            >
              {(field) => (
                <Textarea
                  placeholder={originalTool?.description || 'Enter a custom description...'}
                  rows={3}
                  {...field}
                  value={field.value ?? ''}
                />
              )}
            </FormFieldWrapper>

            <JsonSchemaInput
              control={form.control}
              name="schema"
              label="Schema Override"
              description="Define simplified input parameters for the tool"
              customTemplate={toolSchemaTemplate}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!hasChanges || isSubmitting}>
                Save Override
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
