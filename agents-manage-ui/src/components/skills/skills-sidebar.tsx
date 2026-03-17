'use client';

import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { TreeNode } from '@/components/skills/tree-node';
import {
  type DemoTreeNode,
  findFirstFile,
  findNodeByRoutePath,
} from '@/components/skills/tree-utils';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';

interface SkillsSidebarProps {
  treeNodes: DemoTreeNode[];
  defaultSelectedRoutePath: string;
  fileRouteAliases: Record<string, string>;
  canEdit: boolean;
}

export const SkillsSidebar: FC<SkillsSidebarProps> = ({
  treeNodes,
  defaultSelectedRoutePath,
  fileRouteAliases,
  canEdit,
}) => {
  const { fileSlug } = useParams<{ fileSlug?: string[] }>();
  const routeToken = fileSlug?.join('/');
  const requestedRoutePath = routeToken
    ? (fileRouteAliases[routeToken] ?? routeToken)
    : defaultSelectedRoutePath;
  const fallbackNode = findFirstFile(treeNodes) ?? treeNodes[0] ?? null;
  const selectedNode = findNodeByRoutePath(treeNodes, requestedRoutePath) ?? fallbackNode;
  const selectedRoutePath = selectedNode?.routePath ?? defaultSelectedRoutePath;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Library</SidebarGroupLabel>
        <SidebarGroupContent>
          {treeNodes.length > 0 ? (
            <SidebarMenu>
              {treeNodes.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  selectedRoutePath={selectedRoutePath}
                  canEdit={canEdit}
                />
              ))}
            </SidebarMenu>
          ) : (
            <div className="px-2 py-1 text-sm text-muted-foreground">No skill files yet.</div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
};
