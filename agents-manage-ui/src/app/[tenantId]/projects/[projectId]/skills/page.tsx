import { ChevronRight, File, Folder, Plus } from 'lucide-react';
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
  SidebarMenuAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { cn } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { PromptEditor } from '@/components/editors/prompt-editor';

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

    const childMatch = findFirstFile(node.children);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function renderTreeNode(
  node: DemoTreeNode,
  selectedPath: string,
  collapsedPaths: ReadonlySet<string>,
  buildFileHref: (path: string) => string,
  buildFolderHref: (path: string) => string,
  nested = false
) {
  const isCollapsed = collapsedPaths.has(node.path);
  const isActive = node.kind === 'file' && node.path === selectedPath;
  const icon = node.kind === 'file' ? <File /> : <Folder />;
  const href = node.kind === 'file' ? buildFileHref(node.path) : buildFolderHref(node.path);

  if (!nested) {
    return (
      <SidebarMenuItem key={node.path}>
        <SidebarMenuButton asChild isActive={isActive}>
          <NextLink href={href}>
            {icon}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </NextLink>
        </SidebarMenuButton>
        {node.kind === 'folder' && (
          <SidebarMenuAction asChild className={cn(!isCollapsed && 'rotate-90')}>
            <NextLink href={href}>
              <ChevronRight className="size-4" />
            </NextLink>
          </SidebarMenuAction>
        )}
        {node.children.length && !isCollapsed ? (
          <SidebarMenuSub>
            {node.children.map((child) =>
              renderTreeNode(
                child,
                selectedPath,
                collapsedPaths,
                buildFileHref,
                buildFolderHref,
                true
              )
            )}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuSubItem key={node.path}>
      <SidebarMenuSubButton
        asChild
        isActive={isActive}
        className={cn(node.kind === 'folder' && 'pr-8')}
      >
        <NextLink href={href}>
          {icon}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </NextLink>
      </SidebarMenuSubButton>
      {node.kind === 'folder' && (
        <SidebarMenuAction className={cn('top-1 right-1', !isCollapsed && 'rotate-90')}>
          <ChevronRight className="size-4" />
        </SidebarMenuAction>
      )}
      {node.children.length && !isCollapsed ? (
        <SidebarMenuSub>
          {node.children.map((child) =>
            renderTreeNode(
              child,
              selectedPath,
              collapsedPaths,
              buildFileHref,
              buildFolderHref,
              true
            )
          )}
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
    const collapsedValues: string[] = Array.isArray(rawSearchParams.collapsed)
      ? rawSearchParams.collapsed.filter((value): value is string => typeof value === 'string')
      : typeof rawSearchParams.collapsed === 'string'
        ? [rawSearchParams.collapsed]
        : [];
    const collapsedPaths = new Set<string>(collapsedValues);
    const fallbackNode = findFirstFile(treeNodes) ?? treeNodes[0] ?? null;
    const selectedNode = findNodeByPath(treeNodes, requestedPath) ?? fallbackNode;
    const selectedPath = selectedNode?.path ?? defaultSelectedPath;

    function buildSearch(nextPath: string, nextCollapsedPaths: ReadonlySet<string>) {
      const nextSearchParams = new URLSearchParams();
      if (nextPath) {
        nextSearchParams.set('path', nextPath);
      }
      for (const collapsedPath of [...nextCollapsedPaths].sort()) {
        nextSearchParams.append('collapsed', collapsedPath);
      }
      return nextSearchParams.toString();
    }

    function buildFileHref(targetPath: string) {
      return `/${tenantId}/projects/${projectId}/skills?${buildSearch(targetPath, collapsedPaths)}`;
    }
    function buildFolderHref(targetPath: string) {
      const nextCollapsedPaths = new Set(collapsedPaths);
      if (nextCollapsedPaths.has(targetPath)) {
        nextCollapsedPaths.delete(targetPath);
      } else {
        nextCollapsedPaths.add(targetPath);
      }
      return `/${tenantId}/projects/${projectId}/skills?${buildSearch(selectedPath, nextCollapsedPaths)}`;
    }

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
                      {treeNodes.map((node) =>
                        renderTreeNode(
                          node,
                          selectedPath,
                          collapsedPaths,
                          buildFileHref,
                          buildFolderHref
                        )
                      )}
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
