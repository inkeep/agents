'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ExternalLink } from '@/components/ui/external-link';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import {
  createDataComponentAction,
  updateDataComponentAction,
} from '@/lib/actions/data-components';
import { cn, isRequired } from '@/lib/utils';
import { DeleteDataComponentConfirmation } from '../delete-data-component-confirmation';
import { ComponentRenderGenerator } from '../render/component-render-generator';
import { initialData } from './form-configuration';
import { type DataComponentInput, DataComponentSchema as schema } from './validation';

const resolver = zodResolver(schema);

interface DataComponentFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  defaultValues?: DataComponentInput;
  readOnly?: boolean;
  className?: string;
}

export function DataComponentForm({
  tenantId,
  projectId,
  id,
  defaultValues = initialData,
  readOnly = false,
  className,
}: DataComponentFormProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm({
    resolver,
    defaultValues,
    mode: 'onChange',
  });
  const { isSubmitting, isValid } = form.formState;
  const router = useRouter();

  // Auto-prefill ID based on name field (only for new components)
  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!id,
  });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      if (id) {
        const res = await updateDataComponentAction(tenantId, projectId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to update component');
          return;
        }
        toast.success('Component updated');
      } else {
        const res = await createDataComponentAction(tenantId, projectId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to create component');
          return;
        }
        toast.success('Component created');
        router.push(`/${tenantId}/projects/${projectId}/components`);
      }
    } catch (error) {
      console.error('Error submitting component:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  });

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={onSubmit} className={cn('space-y-8', className)}>
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="ListOrders"
            description={
              <>
                This name is used to identify the component in chat widget integration.{' '}
                <ExternalLink
                  href="https://docs.inkeep.com/typescript-sdk/structured-outputs/data-components#frontend-integration"
                  target="_blank"
                >
                  Learn more
                </ExternalLink>
              </>
            }
            isRequired={isRequired(schema, 'name')}
            disabled={readOnly}
          />
          <GenericInput
            control={form.control}
            name="id"
            label="Id"
            placeholder="my-data-component"
            disabled={!!id || readOnly}
            description={
              id
                ? ''
                : 'Choose a unique identifier for this component. Using an existing id will replace that component.'
            }
            isRequired={isRequired(schema, 'id')}
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="Display a list of user orders with interactive options"
            className="min-h-[80px]"
            isRequired={isRequired(schema, 'description')}
            disabled={readOnly}
          />
          <JsonSchemaInput
            control={form.control}
            name="props"
            label="Properties"
            placeholder="Enter a valid JSON Schema..."
            uri="json-schema-data-component.json"
            isRequired={isRequired(schema, 'props')}
            readOnly={readOnly}
          />

          {id && !readOnly && (
            <ComponentRenderGenerator
              tenantId={tenantId}
              projectId={projectId}
              dataComponentId={id}
              dataComponentName={form.watch('name')}
              existingRender={initialData?.render || null}
              onRenderChanged={(render) => {
                form.setValue('render', render);
              }}
            />
          )}

          {!readOnly && (
            <div className="flex w-full justify-between">
              <Button type="submit" disabled={isSubmitting || !isValid}>
                Save
              </Button>
              {id && (
                <DialogTrigger asChild>
                  <Button type="button" variant="destructive-outline">
                    Delete Component
                  </Button>
                </DialogTrigger>
              )}
            </div>
          )}
        </form>
      </Form>
      {isDeleteOpen && id && (
        <DeleteDataComponentConfirmation
          dataComponentId={id}
          dataComponentName={form.getValues('name')}
          setIsOpen={setIsDeleteOpen}
          redirectOnDelete
        />
      )}
    </Dialog>
  );
}
