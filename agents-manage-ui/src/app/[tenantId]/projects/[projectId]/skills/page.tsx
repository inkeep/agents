import { File, Folder, FolderTree, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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

type DemoTreeNode = {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  content?: string;
  children: DemoTreeNode[];
};

const demoSkillTree: DemoSkillFile[] = [
  {
    filePath: 'foo/SKILL.md',
    content: '1',
  },
  {
    filePath: 'foo/LICENCE.txt',
    content: '2',
  },
  {
    filePath: 'bar/baz/hello.txt',
    content: '3',
  },
  {
    filePath: 'bar/baz/index.html',
    content: '4',
  },
  {
    filePath: 'bar/SKILL.md',
    content: '5',
  },
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

    const childFile = findFirstFile(node.children);
    if (childFile) {
      return childFile;
    }
  }

  return null;
}

function renderTreeNode(
  node: DemoTreeNode,
  selectedPath: string,
  buildHref: (path: string) => string,
  nested = false
) {
  const isActive = node.path === selectedPath;
  const icon = node.kind === 'file' ? <File /> : nested ? <Folder /> : <FolderTree />;

  if (!nested) {
    return (
      <SidebarMenuItem key={node.path}>
        <SidebarMenuButton asChild isActive={isActive}>
          <NextLink href={buildHref(node.path)}>
            {icon}
            <span>{node.name}</span>
          </NextLink>
        </SidebarMenuButton>
        {node.children.length ? (
          <SidebarMenuSub>
            {node.children.map((child) => renderTreeNode(child, selectedPath, buildHref, true))}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuSubItem key={node.path}>
      <SidebarMenuSubButton asChild isActive={isActive}>
        <NextLink href={buildHref(node.path)}>
          {icon}
          <span>{node.name}</span>
        </NextLink>
      </SidebarMenuSubButton>
      {node.children.length ? (
        <SidebarMenuSub>
          {node.children.map((child) => renderTreeNode(child, selectedPath, buildHref, true))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuSubItem>
  );
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
    const buildHref = (targetPath: string) =>
      `/${tenantId}/projects/${projectId}/skills?path=${encodeURIComponent(targetPath)}`;

    const action = permissions.canEdit ? (
      <Button asChild className="flex items-center gap-2">
        <NextLink href={`/${tenantId}/projects/${projectId}/skills/new`}>
          <Plus />
          Create skill
        </NextLink>
      </Button>
    ) : undefined;

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
                      {treeNodes.map((node) => renderTreeNode(node, selectedPath, buildHref))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </aside>
            <section className="min-w-0 overflow-auto p-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Preview
                  </p>
                  <div>
                    <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Showing <code>{selectedNode.path}</code>
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border bg-muted/10">
                  <div className="border-b px-4 py-3 text-sm font-medium">{selectedNode.path}</div>
                  {selectedNode.kind === 'file' ? (
                    <pre className="overflow-x-auto p-4 text-sm leading-6">
                      {selectedNode.content}
                    </pre>
                  ) : (
                    <div className="space-y-3 p-4 text-sm">
                      <p className="text-muted-foreground">
                        This folder contains {selectedNode.children.length} direct item
                        {selectedNode.children.length === 1 ? '' : 's'}.
                      </p>
                      <ul className="space-y-2">
                        {selectedNode.children.map((child) => (
                          <li key={child.path}>
                            <NextLink
                              href={buildHref(child.path)}
                              className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                            >
                              {child.kind === 'file' ? (
                                <File className="size-4" />
                              ) : (
                                <Folder className="size-4" />
                              )}
                              <span>{child.name}</span>
                            </NextLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
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
