'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Info, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type FC, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { ExpandablePromptEditor } from '@/components/editors/expandable-prompt-editor';
import FullPageError from '@/components/errors/full-page-error';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSkillQuery, useUpsertSkillMutation } from '@/lib/query/skills';
import type { Skill } from '@/lib/types/skills';
import { isRequired, serializeJson } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { DeleteSkillConfirmation } from '../delete-skill-confirmation';
import { type SkillInput, SkillSchema as schema } from './validation';

interface SkillFormProps {
  onSuccess?: () => void;
}

const resolver = zodResolver(schema);

function formatFormData(data: Skill | null): SkillInput {
  if (data) {
    return {
      ...data,
      metadata: serializeJson(data.metadata),
    };
  }
  return {
    name: '',
    description: '',
    content: '',
    metadata: '',
  };
}

export const SkillForm: FC<SkillFormProps> = ({ onSuccess }) => {
  'use memo';
  const { tenantId, projectId, skillId } = useParams<{
    tenantId: string;
    projectId: string;
    skillId?: string;
  }>();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { error, isFetching, data: initialData } = useSkillQuery({ skillId });
  const { mutateAsync: upsertSkill } = useUpsertSkillMutation();
  const form = useForm({
    resolver,
    defaultValues: formatFormData(initialData),
    mode: 'onChange',
  });
  const content = useWatch({ control: form.control, name: 'content' });
  const metadata = useWatch({ control: form.control, name: 'metadata' });
  const router = useRouter();

  const onSubmit = form.handleSubmit(async (data) => {
    await upsertSkill({
      skillId: initialData ? data.name : undefined,
      data,
    });
    onSuccess?.();
    if (!skillId) {
      router.push(`/${tenantId}/projects/${projectId}/skills`);
    }
  });

  useEffect(() => {
    if (!isFetching && initialData) {
      form.reset(formatFormData(initialData));
    }
  }, [isFetching, form, initialData]);

  if (error) {
    return (
      <FullPageError
        errorCode={getErrorCode(error)}
        context="skill"
        link={`/${tenantId}/projects/${projectId}/skills`}
        linkText="Back to skills"
      />
    );
  }

  if (isFetching && !initialData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-8 w-full max-w-4xl mx-auto">
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
          isRequired={isRequired(schema, 'name')}
          disabled={!!initialData}
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label={
            <>
              Description
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="text-wrap">
                  <Check className="inline size-3 text-green-500" /> Good example: Extracts text and
                  tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working
                  with PDF documents or when the user mentions PDFs, forms, or document extraction.
                  <br />
                  <br />
                  <X className="inline size-3 text-red-500" /> Bad example: Helps with PDFs.
                </TooltipContent>
              </Tooltip>
            </>
          }
          placeholder="High-level summary of what this skill enforces."
          isRequired={isRequired(schema, 'description')}
        />
        <ExpandablePromptEditor
          label="Content"
          name="content"
          value={content}
          onChange={form.setValue.bind(null, 'content')}
          placeholder={`# PDF Processing

## When to use this skill

Use this skill when the user needs to work with PDF files...

## How to extract text

1. Use pdfplumber for text extraction...

## How to fill forms

...`}
          error={form.formState.errors.content?.message}
          isRequired={isRequired(schema, 'content')}
          uri="content.md"
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
