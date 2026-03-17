import { FilePenLine } from 'lucide-react';
import NextLink from 'next/link';
import type { FC } from 'react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import FullPageError from '@/components/errors/full-page-error';
import { Button } from '@/components/ui/button';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { buildSkillFileEditHref, getSkillFileEditorUri } from '@/lib/utils/skill-files';
import { resolveSkillFilePageData } from '../../skills-data';

const SkillFilePage: FC<
  PageProps<'/[tenantId]/projects/[projectId]/skills/files/[...fileSlug]'>
> = async ({ params }) => {
  const { tenantId, projectId, fileSlug } = await params;

  try {
    const { permissions, selectedFile } = await resolveSkillFilePageData(
      tenantId,
      projectId,
      fileSlug
    );

    if (!selectedFile) {
      return <FullPageError errorCode="not_found" context="skill file" />;
    }

    const action = permissions.canEdit && (
      <Button asChild variant="outline">
        <NextLink
          href={buildSkillFileEditHref(
            tenantId,
            projectId,
            selectedFile.skillId,
            selectedFile.filePath
          )}
        >
          <FilePenLine />
          Edit
        </NextLink>
      </Button>
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              File
            </p>
            <h2 className="text-xl font-semibold">{selectedFile.filePath}</h2>
            <p className="text-sm text-muted-foreground">{selectedFile.skillName}</p>
          </div>
          {action}
        </div>
        <PromptEditor
          readOnly
          value={selectedFile.content}
          uri={getSkillFileEditorUri(selectedFile.filePath)}
          className="min-h-[32rem]"
        />
      </div>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skill file" />;
  }
};

export default SkillFilePage;
