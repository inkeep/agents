import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import { PromptEditor } from '@/components/editors/prompt-editor';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { TreeNode, type DemoTreeNode } from '@/components/skills/tree-node';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const metadata = {
  title: STATIC_LABELS.skills,
  description:
    'Agent Skills are reusable instruction blocks that can be attached to multiple sub-agents and ordered for priority.',
} satisfies Metadata;

const description = (
  <>
    {metadata.description}
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/skills`}>Learn more</ExternalLink>
  </>
);

type DemoSkillFile = {
  filePath: string;
  content: string;
};

const demoSkillTree: DemoSkillFile[] = [
  { filePath: 'foo/SKILL.md', content: '1' },
  { filePath: 'foo/LICENCE.txt', content: '2' },
  { filePath: 'bar/baz/hello.txt', content: '3' },
  { filePath: 'bar/baz/index.html', content: '4' },
  { filePath: 'bar/SKILL.md', content: '5' },
] as const;

const defaultSelectedPath = demoSkillTree[0]?.filePath ?? '';

function buildTree(files: readonly DemoSkillFile[]): DemoTreeNode[] {
  const root: DemoTreeNode[] = [];

  for (const file of files) {
    const segments = file.filePath.split('/').filter(Boolean);
    let children = root;

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/');
      const isFile = index === segments.length - 1;
      let node = children.find((child) => child.path === path);

      if (!node) {
        node = {
          name: segment,
          path,
          kind: isFile ? 'file' : 'folder',
          content: isFile ? file.content : undefined,
          children: [],
        };
        children.push(node);
      }

      if (isFile) {
        node.content = file.content;
      }

      children = node.children;
    }
  }

  return root;
}

function findNodeByPath(nodes: readonly DemoTreeNode[], targetPath: string): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    const childMatch = findNodeByPath(node.children, targetPath);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function findFirstFile(nodes: readonly DemoTreeNode[]): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node;
    }

    const childMatch = findFirstFile(node.children);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

const treeNodes = buildTree(demoSkillTree);

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({
  params,
  searchParams,
}) => {
  const { tenantId, projectId } = await params;
  const rawSearchParams = await searchParams;

  try {
    const permissions = await fetchProjectPermissions(tenantId, projectId);
    const requestedPath =
      typeof rawSearchParams.path === 'string' ? rawSearchParams.path : defaultSelectedPath;
    const fallbackNode = findFirstFile(treeNodes) ?? treeNodes[0] ?? null;
    const selectedNode = findNodeByPath(treeNodes, requestedPath) ?? fallbackNode;
    const selectedPath = selectedNode?.path ?? defaultSelectedPath;

    const action = permissions.canEdit && (
      <Button asChild className="flex items-center gap-2">
        <NextLink href={`/${tenantId}/projects/${projectId}/skills/new`}>
          <Plus />
          Create skill
        </NextLink>
      </Button>
    );

    if (!selectedNode) {
      return (
        <>
          <PageHeader title={metadata.title} description={description} action={action} />
          <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
            No demo skill files configured.
          </div>
        </>
      );
    }

    return (
      <>
        <PageHeader title={metadata.title} description={description} action={action} />
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Library</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {treeNodes.map((node) => (
                        <TreeNode key={node.path} node={node} selectedPath={selectedPath} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </aside>
            <section className="min-w-0 overflow-auto p-6">
              {selectedNode.kind === 'file' ? (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Preview
                    </p>
                    <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
                  </div>
                  <PromptEditor value={selectedNode.content} uri="test.md" />
                </div>
              ) : (
                <div className="min-h-80" />
              )}
            </section>
          </div>
        </div>
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsPage;
