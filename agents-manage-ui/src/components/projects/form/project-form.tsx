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
}

const serializeData = (data: ProjectFormData) => {
  return {
    ...data,
    models: {
      ...data.models,
      base: {
        model: data.models.base.model,
        providerOptions: data.models.base.providerOptions,
      },
      structuredOutput: data.models?.structuredOutput?.model
        ? {
            model: data.models.structuredOutput.model,
            providerOptions: data.models.structuredOutput.providerOptions,
          }
        : undefined,
      summarizer: data.models?.summarizer?.model
        ? {
            model: data.models.summarizer.model,
            providerOptions: data.models.summarizer.providerOptions,
          }
        : undefined,
    },
  };
};

export function ProjectForm({
  tenantId,
  projectId,
  onSuccess,
  onCancel,
  initialData,
}: ProjectFormProps) {
  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      ...defaultValues,
      ...initialData,
    },
  });

  const { isSubmitting, errors, isValid } = form.formState;
  const router = useRouter();

  // Debug logging for validation errors
  console.log('Form errors:', errors);
  console.log('Form is valid:', isValid);
  console.log('Form values:', form.watch());

  // Auto-prefill ID based on name field (only for new components)
  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!projectId,
  });

  const onSubmit = async (data: ProjectFormData) => {
    console.log('🚀 Submit handler called with data:', data);
    const serializedData = serializeData(data);

    console.log('serializedData', serializedData);

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

  const handleButtonClick = () => {
    console.log('🔘 Submit button clicked');
    console.log('Current form state:', {
      isValid,
      errors,
      isDirty: form.formState.isDirty,
      isSubmitting,
    });
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              console.log('🐛 Manual form validation triggered');
              form.trigger().then((isValid) => {
                console.log('Manual validation result:', isValid);
                console.log('Validation errors:', form.formState.errors);
              });
            }}
          >
            Debug Form
          </Button>
          <Button type="submit" disabled={isSubmitting} onClick={handleButtonClick}>
            {projectId ? 'Update project' : 'Create project'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
