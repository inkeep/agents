'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { ExpandablePromptEditor } from '@/components/editors/expandable-prompt-editor';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { createSkillAction, updateSkillAction } from '@/lib/actions/skills';
import type { Skill } from '@/lib/types/skills';
import { cn, formatJsonField } from '@/lib/utils';
import { DeleteSkillConfirmation } from '../delete-skill-confirmation';
import { defaultValues, parseMetadataField, type SkillFormData, SkillSchema } from './validation';

interface SkillFormProps {
  initialData?: Skill;
  onSaved?: () => void;
  className?: string;
}

const formatFormData = (data?: Skill): SkillFormData => {
  if (!data) return defaultValues;

  return {
    name: data.name,
    description: data.description,
    content: data.content,
    metadata: formatJsonField(data.metadata),
  };
};

// Extract to function to fix react compiler errors
// Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement
async function doRequest(
  data: SkillFormData,
  {
    tenantId,
    projectId,
    isUpdate,
  }: {
    tenantId: string;
    projectId: string;
    isUpdate: boolean;
  }
): Promise<{ success: boolean }> {
  const payload = {
    ...data,
    metadata: parseMetadataField(data.metadata),
  };
  const response = isUpdate
    ? await updateSkillAction(tenantId, projectId, data.name, payload)
    : await createSkillAction(tenantId, projectId, payload);
  if (!response.success) {
    toast.error(response.error ?? `Failed to ${isUpdate ? 'update' : 'create'} skill`);
    return { success: false };
  }
  toast.success(`Skill ${isUpdate ? 'updated' : 'created'}`);
  return { success: true };
}

export const SkillForm: FC<SkillFormProps> = ({ initialData, onSaved, className }) => {
  'use memo';

  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema),
    defaultValues: formatFormData(initialData),
    mode: 'onChange',
  });
  const content = useWatch({ control: form.control, name: 'content' });
  const metadata = useWatch({ control: form.control, name: 'metadata' });
  const router = useRouter();

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const result = await doRequest(data, {
        tenantId,
        projectId,
        isUpdate: !!initialData,
      });
      if (!result.success) {
        return;
      }
      if (initialData) {
        if (onSaved) {
          onSaved();
        }
        return;
      }
      if (onSaved) {
        onSaved();
        return;
      }
      router.push(`/${tenantId}/projects/${projectId}/skills`);
    } catch (error) {
      console.error('Error submitting skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save skill');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className={cn('space-y-8', className)}>
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My skill"
          description={
            initialData
              ? ''
              : 'Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen.'
          }
          isRequired
          disabled={!!initialData}
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="High-level summary of what this skill enforces."
          isRequired
        />
        <ExpandablePromptEditor
          label="Content"
          name="content"
          value={content}
          onChange={form.setValue.bind(null, 'content')}
          placeholder="Write Markdown instructions for this skill..."
          error={form.formState.errors.content?.message}
          isRequired
        />
        <ExpandableJsonEditor
          value={metadata ?? ''}
          onChange={form.setValue.bind(null, 'metadata')}
          name="metadata"
          label="Metadata (JSON)"
          placeholder={`{
  "version": "1.0.0",
  "author": "example"
}`}
        />

        <div className="flex w-full justify-between">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Save
          </Button>
          {initialData && (
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete Skill
                </Button>
              </DialogTrigger>
              {isDeleteOpen && (
                <DeleteSkillConfirmation
                  tenantId={tenantId}
                  projectId={projectId}
                  skillId={initialData.id}
                  skillName={initialData.name}
                  setIsOpen={setIsDeleteOpen}
                />
              )}
            </Dialog>
          )}
        </div>
      </form>
    </Form>
  );
};
