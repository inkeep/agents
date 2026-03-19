'use client';

import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { TreeNode } from '@/components/skills/tree-node';
import {
  type DemoTreeNode,
  findFirstFile,
  findNodeByRoutePath,
} from '@/components/skills/tree-utils';

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

  return treeNodes.map((node) => (
    <TreeNode key={node.path} node={node} selectedRoutePath={selectedRoutePath} canEdit={canEdit} />
  ));
};
