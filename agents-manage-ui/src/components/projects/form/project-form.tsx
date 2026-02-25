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
import { cn, isRequired } from '@/lib/utils';
import { defaultValues } from './form-configuration';
import { ProjectModelsSection } from './project-models-section';
import { ProjectStopWhenSection } from './project-stopwhen-section';
import { ProjectWorkAppGitHubAccessSection } from './project-work-app-github-access-section';
import { type ProjectInput, ProjectSchema } from './validation';

interface ProjectFormProps {
  tenantId: string;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  initialData?: ProjectInput;
  readOnly?: boolean;
  className?: string;
}

const cleanProviderOptions = (options: ProjectInput['models']['base']['providerOptions']) => {
  if (!options || (typeof options === 'object' && Object.keys(options).length === 0)) {
    return undefined;
  }
  return options;
};
const cleanStopWhen = (stopWhen: ProjectInput['stopWhen']) => {
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

const serializeData = (data: ProjectInput) => {
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

const createDefaultValues = (initialData?: ProjectInput) => {
  return {
    ...initialData,
    // Handle null values from database - if an object field is null, validation will fail so we need to set it to an empty object
    stopWhen: initialData?.stopWhen || {},
    models: initialData?.models || { base: { model: '' } },
  };
};

export function ProjectForm({
  tenantId,
  projectId,
  onSuccess,
  onCancel,
  initialData,
  readOnly = false,
  className,
}: ProjectFormProps) {
  const form = useForm({
    resolver: zodResolver(ProjectSchema),
    defaultValues: initialData ? createDefaultValues(initialData) : defaultValues,
    mode: 'onChange'
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

  const onSubmit = form.handleSubmit(async (data) => {
    const serializedData = serializeData(data);

    try {
      if (projectId) {
        const res = await updateProjectAction(tenantId, projectId, serializedData);
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
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className={cn('space-y-8', className)}>
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My Project"
          description="A friendly name for your project"
          isRequired={isRequired(ProjectSchema, 'name')}
          disabled={readOnly}
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-project"
          description="Choose a unique identifier for this project. This cannot be changed later."
          disabled={!!projectId || readOnly}
          isRequired={isRequired(ProjectSchema, 'id')}
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Describe what this project is for..."
          className="min-h-[100px]"
          disabled={readOnly}
          isRequired={isRequired(ProjectSchema, 'description')}
        />

        <Separator />

        <ProjectModelsSection control={form.control} disabled={readOnly} />

        <Separator />

        <ProjectStopWhenSection control={form.control} disabled={readOnly} />

        {projectId && (
          <>
            <Separator />

            <ProjectWorkAppGitHubAccessSection
              tenantId={tenantId}
              projectId={projectId}
              disabled={readOnly}
            />
          </>
        )}

        {!readOnly && (
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
        )}
        {readOnly && onCancel && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
