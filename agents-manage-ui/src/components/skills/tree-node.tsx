'use client';

import { ChevronRight, File, Folder, FolderOpenIcon } from 'lucide-react';
import NextLink from 'next/link';
import { useState } from 'react';
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

export function renderTreeNode(
  node: DemoTreeNode,
  selectedPath: string,
  collapsedPaths: ReadonlySet<string>,
  buildFileHref: (path: string) => string,
  buildFolderHref: (path: string) => string,
  nested = false
) {
  'use memo';
  const [isCollapsed, setCollapsed] = useState(false);
  const isActive = node.kind === 'file' && node.path === selectedPath;
  const IconToUse = node.kind === 'file' ? File : isCollapsed ? Folder : FolderOpenIcon;
  const href = node.kind === 'file' ? buildFileHref(node.path) : buildFolderHref(node.path);
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;

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
      )}
    </ComponentToUse>
  );
}
