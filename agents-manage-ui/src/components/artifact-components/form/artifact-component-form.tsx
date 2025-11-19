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
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import { formatJsonField } from '@/lib/utils';
import { DeleteArtifactComponentConfirmation } from '../delete-artifact-component-confirmation';
import { defaultValues } from './form-configuration';
import { type ArtifactComponentFormData, artifactComponentSchema } from './validation';

interface ArtifactComponentFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  initialData?: ArtifactComponentFormData;
  ref?: string;
}

const formatFormData = (data?: ArtifactComponentFormData): ArtifactComponentFormData => {
  if (!data) return defaultValues;

  const formatted = { ...data };
  // Handle both null and undefined props, as well as empty strings
  if (formatted.props) {
    formatted.props = formatJsonField(formatted.props);
  }
  return formatted;
};

export function ArtifactComponentForm({
  id,
  tenantId,
  projectId,
  initialData,
  ref,
}: ArtifactComponentFormProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm<ArtifactComponentFormData>({
    resolver: zodResolver(artifactComponentSchema),
    defaultValues: formatFormData(initialData),
  });

  const { isSubmitting } = form.formState;
  const router = useRouter();

  // Auto-prefill ID based on name field (only for new components)
  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!id,
  });

  const onSubmit = async (data: ArtifactComponentFormData) => {
    try {
      const payload = { ...data } as ArtifactComponent;

      // Explicitly set props to null if it's undefined to ensure it gets cleared
      if (payload.props === undefined) {
        payload.props = null;
      }

      if (id) {
        const res = await updateArtifactComponentAction(tenantId, projectId, payload, ref);
        if (!res.success) {
          toast.error(res.error || 'Failed to update artifact.');
          return;
        }
        toast.success('Artifact updated.');
      } else {
        const res = await createArtifactComponentAction(tenantId, projectId, payload, ref);
        if (!res.success) {
          toast.error(res.error || 'Failed to create artifact');
          return;
        }
        toast.success('Artifact created.');
        router.push(`/${tenantId}/projects/${projectId}/artifacts`);
      }
    } catch (error) {
      console.error('Error submitting artifact:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="Document Artifact"
            isRequired
          />
          <GenericInput
            control={form.control}
            name="id"
            label="Id"
            placeholder="my-artifact"
            disabled={!!id}
            isRequired
            description={
              id
                ? ''
                : 'Choose a unique identifier for this artifact. Using an existing id will replace that artifact.'
            }
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="Structured factual information extracted from search results"
            className="min-h-[80px]"
            isRequired
          />
          <JsonSchemaInput
            control={form.control}
            name="props"
            label="Properties"
            placeholder="Enter a valid JSON Schema with inPreview flags, or leave empty to save entire tool result..."
            description="Optional: Define specific fields with inPreview flags, or leave empty to capture the complete tool response."
          />
          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
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
        </form>
      </Form>
      {isDeleteOpen && id && (
        <DeleteArtifactComponentConfirmation
          artifactComponentId={id}
          artifactComponentName={form.getValues('name')}
          setIsOpen={setIsDeleteOpen}
          redirectOnDelete={true}
        />
      )}
    </Dialog>
  );
}
