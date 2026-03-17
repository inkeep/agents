'use client';

import { useSearchParams } from 'next/navigation';
import type { FC } from 'react';
import { TreeNode } from '@/components/skills/tree-node';
import { type DemoTreeNode, findFirstFile, findNodeByPath } from '@/components/skills/tree-utils';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';

interface SkillsSidebarProps {
  treeNodes: DemoTreeNode[];
  defaultSelectedPath: string;
}

export const SkillsSidebar: FC<SkillsSidebarProps> = ({ treeNodes, defaultSelectedPath }) => {
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get('path') ?? defaultSelectedPath;
  const fallbackNode = findFirstFile(treeNodes) ?? treeNodes[0] ?? null;
  const selectedNode = findNodeByPath(treeNodes, requestedPath) ?? fallbackNode;
  const selectedPath = selectedNode?.path ?? defaultSelectedPath;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Library</SidebarGroupLabel>
        <SidebarGroupContent>
          {treeNodes.length > 0 ? (
            <SidebarMenu>
              {treeNodes.map((node) => (
                <TreeNode key={node.path} node={node} selectedPath={selectedPath} />
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
