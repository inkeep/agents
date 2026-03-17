import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { findFirstFile, findNodeByPath } from '@/components/skills/tree-utils';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { fetchSkillsPageData } from './skills-data';
import { MonacoEditor } from '@/components/editors/monaco-editor';

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({
  params,
  searchParams,
}) => {
  const { tenantId, projectId } = await params;
  const rawSearchParams = await searchParams;

  try {
    const { treeNodes, defaultSelectedPath } = await fetchSkillsPageData(tenantId, projectId);
    const requestedPath =
      typeof rawSearchParams.path === 'string' ? rawSearchParams.path : defaultSelectedPath;
    const fallbackNode = findFirstFile(treeNodes) ?? treeNodes[0] ?? null;
    const selectedNode = findNodeByPath(treeNodes, requestedPath) ?? fallbackNode;

    if (!selectedNode) {
      return (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-sm text-muted-foreground">
          No skill files configured.
        </div>
      );
    }

    if (selectedNode.kind !== 'file') {
      return <div className="min-h-80" />;
    }

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Preview
          </p>
          <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
        </div>
        <MonacoEditor
          uri={selectedNode.path}
          value={selectedNode.content}
          readOnly
          editorOptions={{
            unicodeHighlight: {
              // Disable warnings for – ’ characters
              ambiguousCharacters: false,
            },
          }}
        />
      </div>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsPage;
