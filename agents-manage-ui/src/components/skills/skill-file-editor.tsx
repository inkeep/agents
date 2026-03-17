'use client';

import { ArrowLeft } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
import { toast } from 'sonner';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { DeleteSkillConfirmation } from '@/components/skills/delete-skill-confirmation';
import { DeleteSkillFileConfirmation } from '@/components/skills/delete-skill-file-confirmation';
import { Button } from '@/components/ui/button';
import { updateSkillFileAction } from '@/lib/actions/skill-files';
import {
  buildSkillFileViewHref,
  getSkillFileEditorUri,
  SKILL_ENTRY_FILE_PATH,
} from '@/lib/utils/skill-files';

interface SkillFileEditorProps {
  tenantId: string;
  projectId: string;
  skillId: string;
  skillName: string;
  filePath: string;
  initialContent: string;
}

export const SkillFileEditor: FC<SkillFileEditorProps> = ({
  tenantId,
  projectId,
  skillId,
  skillName,
  filePath,
  initialContent,
}) => {
  'use memo';
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const viewHref = buildSkillFileViewHref(tenantId, projectId, skillId, filePath);
  const isEntryFile = filePath === SKILL_ENTRY_FILE_PATH;

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Edit
          </p>
          <h2 className="text-xl font-semibold">{filePath}</h2>
          <p className="text-sm text-muted-foreground">{skillName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <NextLink href={viewHref}>
              <ArrowLeft />
              Back
            </NextLink>
          </Button>
          <Button type="button" variant="destructive-outline" onClick={() => setIsDeleteOpen(true)}>
            {isEntryFile ? 'Delete skill' : 'Remove file'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || content === initialContent}
          >
            Save changes
          </Button>
        </div>
      </div>

      <PromptEditor
        uri={getSkillFileEditorUri(filePath)}
        value={content}
        onChange={(value) => setContent(value ?? '')}
        className="min-h-[32rem]"
      />

      {isDeleteOpen && (
        <>
          {isEntryFile ? (
            <DeleteSkillConfirmation
              tenantId={tenantId}
              projectId={projectId}
              skillId={skillId}
              skillName={skillName}
              setIsOpen={setIsDeleteOpen}
            />
          ) : (
            <DeleteSkillFileConfirmation
              tenantId={tenantId}
              projectId={projectId}
              skillId={skillId}
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
  );
};
