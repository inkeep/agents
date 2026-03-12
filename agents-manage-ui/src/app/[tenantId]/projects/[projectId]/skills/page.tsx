import { File, Folder, FolderTree, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { fetchSkills } from '@/lib/api/skills';
import { cn } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { formatDateAgo } from '@/lib/utils/format-date';

const colClass = 'align-top whitespace-pre-wrap';

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

type DemoTreeNode = {
  name: string;
  kind: 'folder' | 'file';
  path: string;
  content?: string;
  children?: DemoTreeNode[];
};

const demoSkillTree: DemoTreeNode[] = [
  {
    name: 'skill-creator',
    kind: 'folder',
    path: 'skill-creator',
    children: [
      {
        name: 'SKILL.md',
        kind: 'file',
        path: 'skill-creator/SKILL.md',
        content: `---
name: skill-creator
description: Generate clear, reusable skills for internal teams.
---

## Output requirements

- Include a short overview.
- Add one implementation example.
- Keep operational steps explicit.
`,
      },
      {
        name: 'examples',
        kind: 'folder',
        path: 'skill-creator/examples',
        children: [
          {
            name: 'prompts',
            kind: 'folder',
            path: 'skill-creator/examples/prompts',
            children: [
              {
                name: 'default-prompt.md',
                kind: 'file',
                path: 'skill-creator/examples/prompts/default-prompt.md',
                content: `Draft a new skill that solves one repetitive workflow.

Include:
- when to use it
- required inputs
- expected output format`,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'algorithmic-art',
    kind: 'folder',
    path: 'algorithmic-art',
    children: [
      {
        name: 'SKILL.md',
        kind: 'file',
        path: 'algorithmic-art/SKILL.md',
        content: `---
name: algorithmic-art
description: Produce visual directions for generative artwork experiments.
---

Focus on composition, palette, and repeatable parameter ranges.`,
      },
    ],
  },
  {
    name: 'brand-guidelines',
    kind: 'folder',
    path: 'brand-guidelines',
    children: [
      {
        name: 'SKILL.md',
        kind: 'file',
        path: 'brand-guidelines/SKILL.md',
        content: `---
name: brand-guidelines
description: Keep responses aligned with the Acme voice and style guide.
---

## Primary rules

- Lead with direct, useful answers.
- Prefer concise sentences over marketing phrasing.
- Mirror the product's established terminology.

## Avoid

- Over-explaining simple concepts.
- Introducing new naming without product approval.
- Mixing internal guidance into user-facing copy.
`,
      },
      {
        name: 'LICENSE.md',
        kind: 'file',
        path: 'brand-guidelines/LICENSE.md',
        content: `Internal reference only. Do not distribute outside the organization.`,
      },
      {
        name: 'references',
        kind: 'folder',
        path: 'brand-guidelines/references',
        children: [
          {
            name: 'personality',
            kind: 'folder',
            path: 'brand-guidelines/references/personality',
            children: [
              {
                name: 'voice-and-tone.md',
                kind: 'file',
                path: 'brand-guidelines/references/personality/voice-and-tone.md',
                content: `Tone should stay practical, calm, and specific.

Prefer product language over campaign language.`,
              },
            ],
          },
        ],
      },
    ],
  },
] as const;

const defaultSelectedPath = 'brand-guidelines/SKILL.md';

function findNodeByPath(nodes: readonly DemoTreeNode[], targetPath: string): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children?.length) {
      const childMatch = findNodeByPath(node.children, targetPath);
      if (childMatch) {
        return childMatch;
      }
    }
  }

  return null;
}

function countFiles(node: DemoTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }

  return (node.children ?? []).reduce((total, child) => total + countFiles(child), 0);
}

function countFolders(node: DemoTreeNode): number {
  if (node.kind === 'file') {
    return 0;
  }

  return (node.children ?? []).reduce((total, child) => total + countFolders(child), 1);
}

function renderTreeNode(
  node: DemoTreeNode,
  selectedPath: string,
  buildHref: (path: string) => string,
  nested = false
) {
  const isActive = node.path === selectedPath;
  const itemIcon = node.kind === 'file' ? <File /> : nested ? <Folder /> : <FolderTree />;

  if (!nested) {
    return (
      <SidebarMenuItem key={node.path}>
        <SidebarMenuButton asChild isActive={isActive}>
          <NextLink href={buildHref(node.path)}>
            {itemIcon}
            <span>{node.name}</span>
          </NextLink>
        </SidebarMenuButton>
        {node.children?.length ? (
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
          {itemIcon}
          <span>{node.name}</span>
        </NextLink>
      </SidebarMenuSubButton>
      {node.children?.length ? (
        <SidebarMenuSub>
          {node.children.map((child) => renderTreeNode(child, selectedPath, buildHref, true))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuSubItem>
  );
}

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({
  params,
  searchParams,
}) => {
  const { tenantId, projectId } = await params;
  const { path } = await searchParams;

  try {
    const [skills, permissions] = await Promise.all([
      fetchSkills(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const selectedPath =
      typeof path === 'string' && findNodeByPath(demoSkillTree, path) ? path : defaultSelectedPath;
    const selectedNode = findNodeByPath(demoSkillTree, selectedPath) ?? demoSkillTree[0];
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

    return (
      <>
        <PageHeader title={metadata.title} description={description} action={action} />
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid min-h-[32rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Skill files</p>
                  <p className="text-xs text-muted-foreground">Static mock data for layout work</p>
                </div>
                <SidebarContent className="p-2">
                  <SidebarGroup className="p-0">
                    <SidebarGroupLabel>Library</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {demoSkillTree.map((node) => renderTreeNode(node, selectedPath, buildHref))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
              </div>
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
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border bg-muted/10 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Type
                    </p>
                    <p className="mt-2 text-2xl font-semibold capitalize">{selectedNode.kind}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/10 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Files
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{countFiles(selectedNode)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/10 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Folders
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{countFolders(selectedNode)}</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border bg-muted/10">
                  <div className="border-b px-4 py-3 text-sm font-medium">{selectedNode.path}</div>
                  {selectedNode.kind === 'file' ? (
                    <Table>
                      <TableHeader>
                        <TableRow noHover>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead>Metadata</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skills.data.map((skill) => (
                          // transform is needed to fix an issue in Safari where table rows cannot be relative.
                          <TableRow
                            key={skill.id}
                            style={{ transform: 'translate(0)' }}
                            className="relative"
                          >
                            <TableCell className="align-top">
                              <NextLink
                                // <tr> cannot contain a nested <a>.
                                href={`/${tenantId}/projects/${projectId}/skills/${skill.id}/edit`}
                                className="absolute inset-0"
                              />
                              {skill.name}
                            </TableCell>
                            <TableCell className={colClass}>
                              <div className="h-14 line-clamp-3">{skill.description}</div>
                            </TableCell>
                            <TableCell className={colClass}>
                              <Badge
                                variant="code"
                                className={cn('line-clamp-3 whitespace-normal')}
                              >
                                {skill.content}
                              </Badge>
                            </TableCell>
                            <TableCell className={colClass}>
                              <Badge
                                variant="code"
                                className={cn('line-clamp-3 whitespace-normal')}
                              >
                                {JSON.stringify(skill.metadata)}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              {formatDateAgo(skill.updatedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="space-y-3 p-4 text-sm">
                      <p className="text-muted-foreground">
                        This folder contains {(selectedNode.children ?? []).length} direct item
                        {(selectedNode.children ?? []).length === 1 ? '' : 's'}.
                      </p>
                      <ul className="space-y-2">
                        {(selectedNode.children ?? []).map((child) => (
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
