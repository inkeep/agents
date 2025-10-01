'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import {
  createArtifactComponentAction,
  updateArtifactComponentAction,
} from '@/lib/actions/artifact-components';
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import { formatJsonField } from '@/lib/utils';
import { defaultValues } from './form-configuration';
import { type ArtifactComponentFormData, artifactComponentSchema } from './validation';

interface ArtifactComponentFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  initialData?: ArtifactComponentFormData;
}

const formatFormData = (data?: ArtifactComponentFormData): ArtifactComponentFormData => {
  if (!data) return defaultValues;

  const formatted = { ...data };
  if (formatted.summaryProps) {
    formatted.summaryProps = formatJsonField(formatted.summaryProps);
  }
  if (formatted.fullProps) {
    formatted.fullProps = formatJsonField(formatted.fullProps);
  }
  return formatted;
};

export function ArtifactComponentForm({
  id,
  tenantId,
  projectId,
  initialData,
}: ArtifactComponentFormProps) {
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
      // Transform form data to API format
      const payload = {
        id: data.id,
        name: data.name,
        description: data.description,
        summaryProps: data.summaryProps ? JSON.parse(data.summaryProps) : undefined,
        fullProps: data.fullProps ? JSON.parse(data.fullProps) : undefined,
        // These fields are typically set by the API, but required for the type
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as ArtifactComponent;
      if (id) {
        const res = await updateArtifactComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update artifact.');
          return;
        }
        toast.success('Artifact updated.');
      } else {
        const res = await createArtifactComponentAction(tenantId, projectId, payload);
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
          name="summaryProps"
          label="Summary props (JSON schema)"
          placeholder="Enter a valid JSON Schema..."
          description="Optional. Define the structure for summary data extraction."
        />
        <JsonSchemaInput
          control={form.control}
          name="fullProps"
          label="Full props (JSON schema)"
          placeholder="Enter a valid JSON Schema..."
          description="Optional. Define the structure for detailed data extraction."
        />
        <Button type="submit" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Form>
  );
}
