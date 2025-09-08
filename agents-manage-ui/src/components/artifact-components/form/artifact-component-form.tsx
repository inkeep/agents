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

  const onSubmit = async (data: ArtifactComponentFormData) => {
    try {
      const payload = { ...data } as ArtifactComponent;
      if (id) {
        const res = await updateArtifactComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update artifact component');
          return;
        }
        toast.success('Artifact component updated');
      } else {
        const res = await createArtifactComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to create artifact component');
          return;
        }
        toast.success('Artifact component created');
        router.push(`/${tenantId}/projects/${projectId}/artifact-components`);
      }
    } catch (error) {
      console.error('Error submitting artifact component:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-artifact-component"
          disabled={!!id}
          isRequired
          description={
            id
              ? ''
              : 'Choose a unique identifier for this component. Using an existing id will replace that component.'
          }
        />
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Document Artifact"
          isRequired
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
          label="Summary props (JSON Schema)"
          placeholder="Enter a valid JSON Schema..."
          isRequired
        />
        <JsonSchemaInput
          control={form.control}
          name="fullProps"
          label="Full props (JSON Schema)"
          placeholder="Enter a valid JSON Schema..."
          isRequired
        />
        <Button type="submit" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Form>
  );
}
