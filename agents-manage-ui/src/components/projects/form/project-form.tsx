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
import { cn, isRequired, serializeModels } from '@/lib/utils';
import { initialData } from './form-configuration';
import { ProjectModelsSection } from './project-models-section';
import { ProjectStopWhenSection } from './project-stopwhen-section';
import { ProjectWorkAppGitHubAccessSection } from './project-work-app-github-access-section';
import { type ProjectOutput, ProjectSchema } from './validation';

interface ProjectFormProps {
  tenantId: string;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  defaultValues?: ProjectOutput;
  readOnly?: boolean;
  className?: string;
}

function createDefaultValues(data?: ProjectOutput) {
  if (!data) {
    return initialData;
  }

  return {
    ...data,
    models: serializeModels(data.models),
    stopWhen: data.stopWhen ?? undefined,
  };
}

export function ProjectForm({
  tenantId,
  projectId,
  onSuccess,
  onCancel,
  defaultValues,
  readOnly = false,
  className,
}: ProjectFormProps) {
  const form = useForm({
    resolver: zodResolver(ProjectSchema),
    defaultValues: createDefaultValues(defaultValues),
    mode: 'onChange',
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
    try {
      if (projectId) {
        const res = await updateProjectAction(tenantId, projectId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to update project');
          return;
        }
        toast.success('Project updated successfully');
        onSuccess?.(data.id);
      } else {
        const res = await createProjectAction(tenantId, data);
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

        <div className="flex gap-3 justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          {!readOnly && (
            <Button type="submit" disabled={isSubmitting}>
              {projectId ? 'Update project' : 'Create project'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
