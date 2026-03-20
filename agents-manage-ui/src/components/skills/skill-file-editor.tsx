'use client';

import { useRouter } from 'next/navigation';
import { type FC, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { UnsavedChangesDialog } from '@/components/agent/unsaved-changes-dialog';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';
import { DeleteSkillConfirmation } from '@/components/skills/delete-skill-confirmation';
import { DeleteSkillFileConfirmation } from '@/components/skills/delete-skill-file-confirmation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSkillFileAction, updateSkillFileAction } from '@/lib/actions/skill-files';
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
  initialContent: string;
  canEdit?: boolean;
}

export const SkillFileEditor: FC<SkillFileEditorProps> = ({
  tenantId,
  projectId,
  skillId,
  fileId,
  filePath,
  initialContent,
  canEdit = true,
}) => {
  'use memo';
  const router = useRouter();
  const isCreateMode = !fileId;
  const form = useForm<{ filePath: string; content: string }>({
    defaultValues: {
      filePath,
      content: initialContent,
    },
  });
  const watchedFilePath = useWatch({ control: form.control, name: 'filePath' });
  const content = useWatch({ control: form.control, name: 'content' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isDirty = canEdit && form.formState.isDirty;
  const currentFilePath = (isCreateMode ? watchedFilePath ?? '' : filePath).trim();
  const isEntryFile = !isCreateMode && isSkillEntryFile(filePath);

  useEffect(() => {
    form.reset({ filePath, content: initialContent });
  }, [filePath, form, initialContent]);

  const handleSave = async (): Promise<boolean> => {
    if (!canEdit || (!isCreateMode && !form.formState.isDirty)) {
      return true;
    }

    const nextFilePath = form.getValues('filePath');
    const nextContent = form.getValues('content');
    setIsSaving(true);
    const result = isCreateMode
      ? await createSkillFileAction(tenantId, projectId, skillId, nextFilePath, nextContent)
      : await updateSkillFileAction(tenantId, projectId, skillId, fileId, filePath, nextContent);
    setIsSaving(false);

    if (!result.success) {
      toast.error(result.error ?? `Failed to ${isCreateMode ? 'create' : 'update'} skill file`);
      return false;
    }

    toast.success(isCreateMode ? `Created ${currentFilePath}` : `Saved ${filePath}`);
    if (isCreateMode) {
      router.push(
        buildSkillFileViewHref(
          tenantId,
          projectId,
          skillId,
          result.data?.filePath ?? currentFilePath
        )
      );
      router.refresh();
      return true;
    }

    form.reset({ filePath, content: nextContent });
    router.refresh();
    return true;
  };

  return (
    <>
      <BreadcrumbNav className="h-(--header-height) border-b flex px-4">
        {(currentFilePath ? currentFilePath.split('/') : ['New file']).map((slug, idx, arr) => (
          <BreadcrumbNav.Item
            key={idx}
            href=""
            label={slug || 'New file'}
            isLast={idx === arr.length - 1}
          />
        ))}
      </BreadcrumbNav>
      <div className="p-6 flex flex-col gap-6">
        {isCreateMode && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-file-path">File path</Label>
            <Input
              id="skill-file-path"
              value={watchedFilePath ?? ''}
              onChange={(event) => {
                form.setValue('filePath', event.target.value, { shouldDirty: true });
              }}
              placeholder="templates/day/itinerary-card.html"
              readOnly={!canEdit}
            />
          </div>
        )}
        <PromptEditor
          uri={getSkillFileEditorUri(currentFilePath)}
          value={content ?? ''}
          onChange={(value) => {
            form.setValue('content', value ?? '', { shouldDirty: true });
          }}
          readOnly={!canEdit}
        />

        {canEdit && (
          <div className="flex gap-2 self-end">
            {!isCreateMode && (
              <Button
                type="button"
                variant="destructive-outline"
                onClick={() => setIsDeleteOpen(true)}
              >
                {getSkillFileRemovalLabel(filePath)}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || (!isCreateMode && !isDirty)}
            >
              {isCreateMode ? 'Create file' : 'Save changes'}
            </Button>
            <UnsavedChangesDialog dirty={isDirty} onSubmit={handleSave} />
            {!isCreateMode && isDeleteOpen && (
              <>
                {isEntryFile ? (
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
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};
