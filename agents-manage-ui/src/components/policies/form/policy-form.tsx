'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ExpandablePromptEditor } from '@/components/editors/expandable-prompt-editor';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createPolicyAction, updatePolicyAction } from '@/lib/actions/policies';
import type { Policy } from '@/lib/types/policies';
import { formatJsonField } from '@/lib/utils';
import { DeletePolicyConfirmation } from '../delete-policy-confirmation';
import { defaultValues, type PolicyFormData, parseMetadataField, policySchema } from './validation';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';

interface PolicyFormProps {
  initialData?: Policy;
  onSaved?: () => void;
}

const formatFormData = (data?: Policy): PolicyFormData => {
  if (!data) return defaultValues;

  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    content: data.content || '',
    metadata: formatJsonField(data.metadata),
  };
};

export function PolicyForm({ initialData, onSaved }: PolicyFormProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
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

  const onSubmit = async (data: PolicyFormData) => {
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
        const res = await updatePolicyAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update policy');
          return;
        }
        toast.success('Policy updated');
        onSaved?.();
        return;
      }
      const res = await createPolicyAction(tenantId, projectId, payload);
      if (!res.success) {
        toast.error(res.error || 'Failed to create policy');
        return;
      }
      toast.success('Policy created');
      if (onSaved) {
        onSaved();
        return;
      }
      router.push(`/${tenantId}/projects/${projectId}/policies`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Metadata')) {
        form.setError('metadata', { message: error.message });
        toast.error(error.message);
        return;
      }

      console.error('Error submitting policy:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save policy');
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
            placeholder="My policy"
            isRequired
          />
          <GenericInput
            control={form.control}
            name="id"
            label="Id"
            placeholder="my-policy"
            description={
              initialData
                ? ''
                : 'Choose a unique identifier for this policy. Using an existing id will replace that policy.'
            }
            disabled={!!initialData}
            isRequired
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="High-level summary of what this policy enforces."
            className="min-h-[80px]"
            isRequired
          />
          <ExpandablePromptEditor
            label="Content"
            name="content"
            value={form.watch('content')}
            onChange={(value) => form.setValue('content', value, { shouldValidate: true })}
            placeholder="Write Markdown instructions for this policy..."
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
                  Delete Policy
                </Button>
              </DialogTrigger>
            )}
          </div>
        </form>
      </Form>

      {isDeleteOpen && initialData && (
        <DeletePolicyConfirmation
          tenantId={tenantId}
          projectId={projectId}
          policyId={initialData.id}
          policyName={initialData.name}
          setIsOpen={setIsDeleteOpen}
        />
      )}
    </Dialog>
  );
}
