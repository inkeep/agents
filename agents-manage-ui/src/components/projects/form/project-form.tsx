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
import { createProjectAction, updateProjectAction } from '@/lib/actions/projects';
import { defaultValues } from './form-configuration';
import { type ProjectFormData, projectSchema } from './validation';
import { ProjectModelsSection } from './project-models-section';
import { ProjectStopWhenSection } from './project-stopwhen-section';

interface ProjectFormProps {
  tenantId: string;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
  onCancel?: () => void;
  initialData?: ProjectFormData;
}

export function ProjectForm({
  tenantId,
  projectId,
  onSuccess,
  onCancel,
  initialData,
}: ProjectFormProps) {
  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: initialData || defaultValues,
  });

  const { isSubmitting } = form.formState;
  const router = useRouter();

  const onSubmit = async (data: ProjectFormData) => {
    try {
      if (projectId) {
        const res = await updateProjectAction(tenantId, projectId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to update project');
          return;
        }
        toast.success('Project updated successfully');
        if (onSuccess) {
          onSuccess(data.id);
        }
      } else {
        const res = await createProjectAction(tenantId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to create project');
          return;
        }
        toast.success('Project created successfully');

        if (onSuccess) {
          onSuccess(data.id);
        } else {
          // Navigate to the new project's graphs page
          router.push(`/${tenantId}/projects/${data.id}/graphs`);
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
          name="id"
          label="Project ID"
          placeholder="my-project"
          description="Choose a unique identifier for this project. This cannot be changed later."
          disabled={!!projectId}
          isRequired
        />
        <GenericInput
          control={form.control}
          name="name"
          label="Project Name"
          placeholder="My Project"
          description="A friendly name for your project"
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

        <div className="flex gap-3 justify-end">
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
