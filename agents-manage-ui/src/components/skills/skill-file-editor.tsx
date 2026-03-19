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
import { updateSkillFileAction } from '@/lib/actions/skill-files';
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
  filePath: string;
  initialContent: string;
}

export const SkillFileEditor: FC<SkillFileEditorProps> = ({
  tenantId,
  projectId,
  skillId,
  filePath,
  initialContent,
}) => {
  'use memo';
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const viewHref = buildSkillFileViewHref(tenantId, projectId, skillId, filePath);
  const isEntryFile = isSkillEntryFile(filePath);

  const handleSave = async () => {
    setIsSaving(true);
    const result = await updateSkillFileAction(tenantId, projectId, skillId, filePath, content);
    setIsSaving(false);

    if (!result.success) {
      toast.error(result.error ?? 'Failed to update skill file');
      return;
    }

    toast.success(`Saved ${filePath}`);
    router.push(viewHref);
    router.refresh();
  };

  return (
    <>
      <BreadcrumbNav className="h-(--header-height) border-b flex px-4">
        {filePath.split('/').map((slug, idx, arr) => (
          <BreadcrumbNav.Item key={idx} href="" label={slug} isLast={idx === arr.length - 1} />
        ))}
      </BreadcrumbNav>
      <div className="p-6 flex flex-col gap-6">
        <PromptEditor
          uri={getSkillFileEditorUri(filePath)}
          value={content ?? ''}
          onChange={(value) => {
            form.setValue('content', value ?? '', { shouldDirty: true });
          }}
          readOnly={!canEdit}
        />

        {canEdit && (
          <div className="flex gap-2 self-end">
            <Button
              type="button"
              variant="destructive-outline"
              onClick={() => setIsDeleteOpen(true)}
            >
              {getSkillFileRemovalLabel(filePath)}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving || !isDirty}>
              Save changes
            </Button>
            <UnsavedChangesDialog dirty={isDirty} onSubmit={handleSave} />
            {isDeleteOpen && (
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
