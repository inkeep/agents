'use client';

import { ChevronRight, File, Folder, FolderOpenIcon } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type FC, type MouseEvent, useState } from 'react';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export interface DemoTreeNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  content?: string;
  children: DemoTreeNode[];
}

export const TreeNode: FC<{
  node: DemoTreeNode;
  selectedPath: string;
  nested?: boolean;
}> = ({ node, nested = false, selectedPath }) => {
  'use memo';

  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  function buildSearch(nextPath: string) {
    const nextSearchParams = new URLSearchParams();
    if (nextPath) {
      nextSearchParams.set('path', nextPath);
    }
    return nextSearchParams.toString();
  }

  function buildFileHref(targetPath: string) {
    return `/${tenantId}/projects/${projectId}/skills?${buildSearch(targetPath)}`;
  }
  function buildFolderHref() {
    return `/${tenantId}/projects/${projectId}/skills?${buildSearch(selectedPath)}`;
  }

  const [isCollapsed, setCollapsed] = useState(false);
  const isActive = node.kind === 'file' && node.path === selectedPath;
  const IconToUse = node.kind === 'file' ? File : isCollapsed ? Folder : FolderOpenIcon;
  const href = node.kind === 'file' ? buildFileHref(node.path) : buildFolderHref();
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
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} nested />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};
