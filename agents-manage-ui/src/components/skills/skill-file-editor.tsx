'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { UnsavedChangesDialog } from '@/components/agent/unsaved-changes-dialog';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { GenericInput } from '@/components/form/generic-input';
import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';
import { DeleteSkillConfirmation } from '@/components/skills/delete-skill-confirmation';
import { DeleteSkillFileConfirmation } from '@/components/skills/delete-skill-file-confirmation';
import { SkillFileSchema } from '@/components/skills/form/validation';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { createSkillFileAction, updateSkillFileAction } from '@/lib/actions/skill-files';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import {
  buildSkillFileViewHref,
  getSkillFileEditorUri,
  getSkillFileRemovalLabel,
  isSkillEntryFile,
  SKILL_ENTRY_FILE_PATH,
} from '@/lib/utils/skill-files';

interface SkillFileEditorProps {
  tenantId: string;
  projectId: string;
  skillId: string;
  fileId?: string;
  filePath: string;
  initialDirectoryPath?: string;
  initialContent: string;
}

function normalizeDirectoryPath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeCreateFilePathInput(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildCreateFilePath(directoryPath: string, pathInput: string): string {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedPathInput = normalizeCreateFilePathInput(pathInput);

  return [normalizedDirectoryPath, normalizedPathInput].filter(Boolean).join('/');
}

export const SkillFileEditor: FC<SkillFileEditorProps> = ({
  tenantId,
  projectId,
  skillId,
  fileId,
  filePath,
  initialDirectoryPath,
  initialContent,
}) => {
  'use memo';
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const router = useRouter();
  const isCreateMode = !fileId;
  const createDirectoryPath = normalizeDirectoryPath(initialDirectoryPath ?? '');
  const form = useForm({
    resolver: zodResolver(SkillFileSchema),
    defaultValues: {
      filePath: isCreateMode ? '' : filePath,
      content: initialContent,
    },
    mode: 'onChange',
  });
  const watchedFilePath = useWatch({ control: form.control, name: 'filePath' });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { isDirty, isValid, isSubmitting } = form.formState;
  const currentFilePath = isCreateMode
    ? buildCreateFilePath(createDirectoryPath, watchedFilePath ?? '')
    : filePath.trim();
  const createDirectorySegments = createDirectoryPath.split('/').filter(Boolean);
  const isSaveDisabled = isSubmitting || !canEdit || !isDirty || !isValid;
  const isEntryFile = !isCreateMode && isSkillEntryFile(filePath);

  const handleSave = async (): Promise<boolean> => {
    if (!canEdit || (!isCreateMode && !isDirty)) {
      return true;
    }

    let didSave = false;

    await form.handleSubmit(async (data) => {
      const nextFilePath = isCreateMode
        ? buildCreateFilePath(createDirectoryPath, data.filePath)
        : data.filePath;

      try {
        const result = isCreateMode
          ? await createSkillFileAction(tenantId, projectId, skillId, nextFilePath, data.content)
          : await updateSkillFileAction(
              tenantId,
              projectId,
              skillId,
              fileId,
              filePath,
              data.content
            );

        if (!result.success) {
          toast.error(result.error ?? `Failed to ${isCreateMode ? 'create' : 'update'} skill file`);
          return;
        }

        const savedFilePath = result.data?.filePath ?? nextFilePath;
        toast.success(isCreateMode ? `Created ${savedFilePath}` : `Saved ${filePath}`);

        if (isCreateMode) {
          router.push(buildSkillFileViewHref(tenantId, projectId, skillId, savedFilePath));
          router.refresh();
          didSave = true;
          return;
        }

        form.reset({ filePath, content: data.content });
        router.refresh();
        didSave = true;
      } catch {}
    })();

    return didSave;
  };

  return (
    <Form {...form}>
      <form className="contents" onSubmit={handleSave}>
        <div className="flex items-center border-b px-4 gap-2 h-(--header-height) shrink-0">
          <BreadcrumbNav>
            {isCreateMode ? (
              <>
                {createDirectorySegments.map((segment, index) => (
                  <BreadcrumbNav.Item
                    key={`${segment}-${index}`}
                    href=""
                    label={segment}
                    isLast={false}
                  />
                ))}
                <li aria-current="page" className="shrink-0 font-medium text-foreground *:contents">
                  <GenericInput
                    control={form.control}
                    name="filePath"
                    label={<span className="sr-only">File name</span>}
                    placeholder="itinerary-card.html"
                    disabled={!canEdit}
                  />
                </li>
              </>
            ) : (
              (currentFilePath ? currentFilePath.split('/') : ['New file']).map(
                (slug, idx, arr) => (
                  <BreadcrumbNav.Item
                    key={idx}
                    href=""
                    label={slug || 'New file'}
                    isLast={idx === arr.length - 1}
                  />
                )
              )
            )}
          </BreadcrumbNav>
          {canEdit && (
            <div className="ml-auto flex gap-1">
              {!isCreateMode && (
                <Button
                  type="button"
                  variant="destructive-outline"
                  onClick={() => setIsDeleteOpen(true)}
                  size="sm"
                >
                  {getSkillFileRemovalLabel(filePath)}
                  {isDeleteOpen &&
                    (isEntryFile ? (
                      <DeleteSkillConfirmation skillId={skillId} setIsOpen={setIsDeleteOpen} />
                    ) : (
                      <DeleteSkillFileConfirmation
                        skillId={skillId}
                        fileId={fileId}
                        filePath={filePath}
                        redirectPath={buildSkillFileViewHref(
                          tenantId,
                          projectId,
                          skillId,
                          SKILL_ENTRY_FILE_PATH
                        )}
                        setIsOpen={setIsDeleteOpen}
                      />
                    ))}
                </Button>
              )}
              <Button type="submit" disabled={isSaveDisabled} size="sm">
                {isCreateMode ? 'Create file' : 'Save changes'}
              </Button>
              <UnsavedChangesDialog dirty={canEdit && isDirty} onSubmit={handleSave} />
            </div>
          )}
        </div>
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem className="contents">
              <FormControl>
                <PromptEditor
                  uri={getSkillFileEditorUri(currentFilePath)}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  readOnly={!canEdit}
                  hasDynamicHeight={false}
                  className="grow border-none rounded-none has-[&>.focused]:ring-transparent"
                  editorOptions={{
                    lineNumbers: 'on',
                  }}
                />
              </FormControl>
              <FormMessage className="p-4" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
