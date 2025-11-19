'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createProjectAction, updateProjectAction } from '@/lib/actions/projects';
import { defaultValues } from './form-configuration';
import { ProjectModelsSection } from './project-models-section';
import { ProjectStopWhenSection } from './project-stopwhen-section';
import { type ProjectFormData, projectSchema } from './validation';

interface ProjectFormProps {
  tenantId: string;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  initialData?: ProjectFormData;
  ref?: string;
}

const serializeData = (data: ProjectFormData) => {
  const cleanProviderOptions = (options: any) => {
    if (!options || (typeof options === 'object' && Object.keys(options).length === 0)) {
      return undefined;
    }
    return options;
  };

  const cleanStopWhen = (stopWhen: any) => {
    // If stopWhen is null, undefined, or empty object, return empty object (undefined will not update the field)
    if (!stopWhen || (typeof stopWhen === 'object' && Object.keys(stopWhen).length === 0)) {
      return {};
    }

    // Clean the individual properties - remove null/undefined values
    const cleaned: any = {};
    if (stopWhen.transferCountIs !== null && stopWhen.transferCountIs !== undefined) {
      cleaned.transferCountIs = stopWhen.transferCountIs;
    }
    if (stopWhen.stepCountIs !== null && stopWhen.stepCountIs !== undefined) {
      cleaned.stepCountIs = stopWhen.stepCountIs;
    }

    if (Object.keys(cleaned).length === 0) {
      return {};
    }

    return cleaned;
  };

  return {
    ...data,
    models: {
      ...data.models,
      base: {
        model: data.models.base.model,
        providerOptions: cleanProviderOptions(data.models.base.providerOptions),
      },
      structuredOutput: data.models?.structuredOutput?.model
        ? {
            model: data.models.structuredOutput.model,
            providerOptions: cleanProviderOptions(data.models.structuredOutput.providerOptions),
          }
        : undefined,
      summarizer: data.models?.summarizer?.model
        ? {
            model: data.models.summarizer.model,
            providerOptions: cleanProviderOptions(data.models.summarizer.providerOptions),
          }
        : undefined,
    },
    stopWhen: cleanStopWhen(data.stopWhen),
  };
};

const createDefaultValues = (initialData?: ProjectFormData) => {
  return {
    ...initialData,
    // Handle null values from database - if an object field is null, validation will fail so we need to set it to an empty object
    stopWhen: initialData?.stopWhen || {},
    models: initialData?.models || { base: { model: '', providerOptions: null } },
  };
};

export function ProjectForm({
  tenantId,
  projectId,
  onSuccess,
  onCancel,
  initialData,
  ref,
}: ProjectFormProps) {
  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: initialData ? createDefaultValues(initialData) : { ...defaultValues },
  });

  const { isSubmitting } = form.formState;
  const router = useRouter();

  // Auto-prefill ID based on name field (only for new components)
  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!projectId,
  });

  const onSubmit = async (data: ProjectFormData) => {
    const serializedData = serializeData(data);

    try {
      if (projectId) {
        const res = await updateProjectAction(tenantId, projectId, serializedData, ref);
        if (!res.success) {
          toast.error(res.error || 'Failed to update project');
          return;
        }
        toast.success('Project updated successfully');
        if (onSuccess) {
          onSuccess(data.id);
        }
      } else {
        const res = await createProjectAction(tenantId, serializedData);
        if (!res.success) {
          toast.error(res.error || 'Failed to create project');
          return;
        }
        toast.success('Project created successfully');

        if (onSuccess) {
          onSuccess(data.id);
        } else {
          // Navigate to the new project's agent page
          router.push(`/${tenantId}/projects/${data.id}/agent`);
        }
      }
    } catch (error) {
      console.error('Error creating project:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
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
          placeholder="My Project"
          description="A friendly name for your project"
          isRequired
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-project"
          description="Choose a unique identifier for this project. This cannot be changed later."
          disabled={!!projectId}
          isRequired
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Describe what this project is for..."
          className="min-h-[100px]"
          isRequired
        />

        <Separator />

        <ProjectModelsSection control={form.control} />

        <Separator />

        <ProjectStopWhenSection control={form.control} />

        <div className={`flex gap-3 ${onCancel ? 'justify-end' : 'justify-start'}`}>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {projectId ? 'Update project' : 'Create project'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
