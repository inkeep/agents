'use client';

import { ChevronRight, File, Folder, FolderOpenIcon } from 'lucide-react';
import NextLink from 'next/link';
import { type FC, useState } from 'react';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';

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
  console.log(node.children);
  return (
    <ComponentToUse key={node.path}>
      <ButtonToUse asChild isActive={isActive}>
        <NextLink href={href}>
          <IconToUse />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </NextLink>
      </ButtonToUse>
      {node.kind === 'folder' && (
        <SidebarMenuAction
          className={cn(!isCollapsed && 'rotate-90')}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronRight className="size-4" />
        </SidebarMenuAction>
      )}
      {node.children.length > 0 && !isCollapsed && (
        <SidebarMenuSub>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} nested />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};
