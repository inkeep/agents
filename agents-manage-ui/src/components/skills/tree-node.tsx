'use client';

import { ChevronRight, File, Folder, FolderOpenIcon } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type FC, type MouseEvent, useState } from 'react';
import type { DemoTreeNode } from '@/components/skills/tree-utils';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { buildSkillFileViewHref } from '@/lib/utils/skill-files';

export const TreeNode: FC<{
  node: DemoTreeNode;
  selectedRoutePath: string;
  nested?: boolean;
}> = ({ node, nested = false, selectedRoutePath }) => {
  'use memo';

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const [isCollapsed, setCollapsed] = useState(false);
  const isActive = node.kind === 'file' && node.routePath === selectedRoutePath;
  const IconToUse = node.kind === 'file' ? File : isCollapsed ? Folder : FolderOpenIcon;
  const href =
    node.kind === 'file' && node.skillId && node.filePath
      ? buildSkillFileViewHref(tenantId, projectId, node.skillId, node.filePath)
      : '';
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;

  const content = (
    <>
      <IconToUse />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </>
  );

  function handleCollapse(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    setCollapsed((v) => !v);
  }

  return (
    <ComponentToUse key={node.path}>
      {node.kind === 'file' ? (
        <SidebarMenuButton className="px-0!">
          <ButtonToUse asChild isActive={isActive} className="w-full">
            <NextLink href={href}>{content}</NextLink>
          </ButtonToUse>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuSubButton onClick={handleCollapse}>{content}</SidebarMenuSubButton>
      )}
      {node.kind === 'folder' && (
        <SidebarMenuAction className={cn(!isCollapsed && 'rotate-90')} onClick={handleCollapse}>
          <ChevronRight className="size-4" />
        </SidebarMenuAction>
      )}
      {node.children.length > 0 && !isCollapsed && (
        <SidebarMenuSub className="pr-0 mr-0">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} selectedRoutePath={selectedRoutePath} nested />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};
