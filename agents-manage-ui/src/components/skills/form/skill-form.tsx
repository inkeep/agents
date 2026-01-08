'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { ExpandablePromptEditor } from '@/components/editors/expandable-prompt-editor';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createSkillAction, updateSkillAction } from '@/lib/actions/skills';
import type { Skill } from '@/lib/types/skills';
import { formatJsonField } from '@/lib/utils';
import { DeleteSkillConfirmation } from '../delete-skill-confirmation';
import { defaultValues, parseMetadataField, type SkillFormData, SkillSchema } from './validation';

interface SkillFormProps {
  initialData?: Skill;
  onSaved?: () => void;
}

const formatFormData = (data?: Skill): SkillFormData => {
  if (!data) return defaultValues;

  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    content: data.content || '',
    metadata: formatJsonField(data.metadata),
  };
};

export function SkillForm({ initialData, onSaved }: SkillFormProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm<SkillFormData>({
    resolver: zodResolver(SkillSchema),
    defaultValues: formatFormData(initialData),
  });
  const { isSubmitting } = form.formState;
  const router = useRouter();

  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!initialData,
  });

  const onSubmit = async (data: SkillFormData) => {
    try {
      const parsedMetadata = parseMetadataField(data.metadata);
      const payload = {
        id: data.id.trim(),
        name: data.name.trim(),
        description: data.description.trim(),
        content: data.content,
        metadata: parsedMetadata,
      };

      if (initialData) {
        const res = await updateSkillAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update skill');
          return;
        }
        toast.success('Skill updated');
        onSaved?.();
        return;
      }
      const res = await createSkillAction(tenantId, projectId, payload);
      if (!res.success) {
        toast.error(res.error || 'Failed to create skill');
        return;
      }
      toast.success('Skill created');
      if (onSaved) {
        onSaved();
        return;
      }
      router.push(`/${tenantId}/projects/${projectId}/skills`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Metadata')) {
        form.setError('metadata', { message: error.message });
        toast.error(error.message);
        return;
      }

      console.error('Error submitting skill:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save skill');
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
            placeholder="My skill"
            isRequired
          />
          <GenericInput
            control={form.control}
            name="id"
            label="Id"
            placeholder="my-skill"
            description={
              initialData
                ? ''
                : 'Choose a unique identifier for this skill. Using an existing id will replace that skill.'
            }
            disabled={!!initialData}
            isRequired
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="High-level summary of what this skill enforces."
            className="min-h-[80px]"
            isRequired
          />
          <ExpandablePromptEditor
            label="Content"
            name="content"
            value={form.watch('content')}
            onChange={(value) => form.setValue('content', value, { shouldValidate: true })}
            placeholder="Write Markdown instructions for this skill..."
            error={form.formState.errors.content?.message}
            isRequired
          />
          <ExpandableJsonEditor
            value={form.watch('metadata') ?? ''}
            onChange={(value) => form.setValue('metadata', value)}
            name="metadata"
            label="Metadata (JSON)"
            placeholder={`{
  "version": "1.0.0",
  "tags": ["safety"]
}`}
          />

          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
            {initialData && (
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete Skill
                </Button>
              </DialogTrigger>
            )}
          </div>
        </form>
      </Form>

      {isDeleteOpen && initialData && (
        <DeleteSkillConfirmation
          tenantId={tenantId}
          projectId={projectId}
          skillId={initialData.id}
          skillName={initialData.name}
          setIsOpen={setIsDeleteOpen}
        />
      )}
    </Dialog>
  );
}
