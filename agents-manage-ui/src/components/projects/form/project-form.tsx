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
import { cn, serializeJson } from '@/lib/utils';
import { defaultValues } from './form-configuration';
import { ProjectModelsSection } from './project-models-section';
import { ProjectStopWhenSection } from './project-stopwhen-section';
import { ProjectWorkAppGitHubAccessSection } from './project-work-app-github-access-section';
import { type ProjectFormData, type ProjectFormInputValues, projectSchema } from './validation';

interface ProjectFormProps {
  tenantId: string;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  initialData?: ProjectFormData;
  readOnly?: boolean;
  className?: string;
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
        ...(data.models.base.fallbackModels?.length && {
          fallbackModels: data.models.base.fallbackModels.filter(Boolean),
        }),
        ...(data.models.base.allowedProviders?.length && {
          allowedProviders: data.models.base.allowedProviders.filter(Boolean),
        }),
      },
      structuredOutput: data.models?.structuredOutput?.model
        ? {
            model: data.models.structuredOutput.model,
            providerOptions: cleanProviderOptions(data.models.structuredOutput.providerOptions),
            ...(data.models.structuredOutput.fallbackModels?.length && {
              fallbackModels: data.models.structuredOutput.fallbackModels.filter(Boolean),
            }),
            ...(data.models.structuredOutput.allowedProviders?.length && {
              allowedProviders: data.models.structuredOutput.allowedProviders.filter(Boolean),
            }),
          }
        : undefined,
      summarizer: data.models?.summarizer?.model
        ? {
            model: data.models.summarizer.model,
            providerOptions: cleanProviderOptions(data.models.summarizer.providerOptions),
            ...(data.models.summarizer.fallbackModels?.length && {
              fallbackModels: data.models.summarizer.fallbackModels.filter(Boolean),
            }),
            ...(data.models.summarizer.allowedProviders?.length && {
              allowedProviders: data.models.summarizer.allowedProviders.filter(Boolean),
            }),
          }
        : undefined,
    },
    stopWhen: cleanStopWhen(data.stopWhen),
  };
};

const createDefaultValues = (initialData?: ProjectFormData): ProjectFormInputValues => {
  if (!initialData) {
    return { ...defaultValues };
  }

  return {
    ...initialData,
    stopWhen: initialData.stopWhen || {},
    models: {
      base: {
        ...initialData.models.base,
        providerOptions: serializeJson(initialData.models.base.providerOptions),
      },
      ...(initialData.models.structuredOutput && {
        structuredOutput: {
          ...initialData.models.structuredOutput,
          providerOptions: serializeJson(initialData.models.structuredOutput.providerOptions),
        },
      }),
      ...(initialData.models.summarizer && {
        summarizer: {
          ...initialData.models.summarizer,
          providerOptions: serializeJson(initialData.models.summarizer.providerOptions),
        },
      }),
    },
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
  const form = useForm<ProjectFormInputValues, unknown, ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: createDefaultValues(initialData),
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
          const isEntitlementError = res.code === 'payment_required';
          toast.error(res.error || 'Failed to create project', {
            ...(isEntitlementError && {
              action: {
                label: 'See usage',
                onClick: () => {
                  window.location.href = `/${tenantId}/billing`;
                },
              },
            }),
          });
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
  }, console.error);

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className={cn('space-y-8', className)}>
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My Project"
          description="A friendly name for your project"
          isRequired
          disabled={readOnly}
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-project"
          description="Choose a unique identifier for this project. This cannot be changed later."
          disabled={!!projectId || readOnly}
          isRequired
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Describe what this project is for..."
          className="min-h-[100px]"
          disabled={readOnly}
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
