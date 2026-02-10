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
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import {
  createArtifactComponentAction,
  updateArtifactComponentAction,
} from '@/lib/actions/artifact-components';
import { isRequired } from '@/lib/utils';
import { DeleteArtifactComponentConfirmation } from '../delete-artifact-component-confirmation';
import { ComponentRenderGenerator } from '../render/component-render-generator';
import { initialData } from './form-configuration';
import { type ArtifactComponentInput, ArtifactComponentSchema as schema } from './validation';

const resolver = zodResolver(schema);

interface ArtifactComponentFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  defaultValues?: ArtifactComponentInput;
  readOnly?: boolean;
}

export function ArtifactComponentForm({
  id,
  tenantId,
  projectId,
  defaultValues = initialData,
  readOnly = false,
}: ArtifactComponentFormProps) {
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

  const onSubmit = form.handleSubmit(async (payload) => {
    try {
      if (id) {
        const res = await updateArtifactComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update artifact.');
          return;
        }
        toast.success('Artifact updated.');
        return;
      }
      const res = await createArtifactComponentAction(tenantId, projectId, payload);
      if (!res.success) {
        toast.error(res.error || 'Failed to create artifact');
        return;
      }
      toast.success('Artifact created.');
      router.push(`/${tenantId}/projects/${projectId}/artifacts`);
    } catch (error) {
      console.error('Error submitting artifact:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast.error(errorMessage);
    }
  });

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto space-y-8">
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="Document Artifact"
            isRequired={isRequired(schema, 'name')}
            disabled={readOnly}
          />
          <GenericInput
            control={form.control}
            name="id"
            label="Id"
            placeholder="my-artifact"
            disabled={!!id || readOnly}
            isRequired={isRequired(schema, 'id')}
            description={
              !id &&
              'Choose a unique identifier for this artifact. Using an existing id will replace that artifact.'
            }
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="Structured factual information extracted from search results"
            className="min-h-[80px]"
            disabled={readOnly}
            isRequired={isRequired(schema, 'description')}
          />
          <JsonSchemaInput
            control={form.control}
            name="props"
            label="Properties"
            placeholder="Enter a valid JSON Schema with inPreview flags, or leave empty to save entire tool result..."
            description="Optional: Define specific fields with inPreview flags, or leave empty to capture the complete tool response."
            uri="custom-json-schema-artifact-component.json"
            hasInPreview
            readOnly={readOnly}
            isRequired={isRequired(schema, 'props')}
          />

          {id && !readOnly && (
            <ComponentRenderGenerator
              tenantId={tenantId}
              projectId={projectId}
              artifactComponentId={id}
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
                    Delete Artifact
                  </Button>
                </DialogTrigger>
              )}
            </div>
          )}
        </form>
      </Form>
      {isDeleteOpen && id && (
        <DeleteArtifactComponentConfirmation
          artifactComponentId={id}
          artifactComponentName={form.getValues('name')}
          setIsOpen={setIsDeleteOpen}
          redirectOnDelete
        />
      )}
    </Dialog>
  );
}
