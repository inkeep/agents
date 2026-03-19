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
  fileRouteAliases: Record<string, string>;
  canEdit: boolean;
}

export const SkillsSidebar: FC<SkillsSidebarProps> = ({ treeNodes, fileRouteAliases, canEdit }) => {
  const { fileSlug } = useParams<{ fileSlug?: string[] }>();
  const routeToken = fileSlug?.join('/');
  const requestedRoutePath = routeToken
    ? (fileRouteAliases[routeToken] ?? routeToken)
    : (treeNodes[0].routePath as string);
  const { routePath } =
    findNodeByRoutePath(treeNodes, requestedRoutePath) ??
    // fallback nodes
    findFirstFile(treeNodes) ??
    treeNodes[0];

  return treeNodes.map((node) => (
    <TreeNode
      key={node.path}
      node={node}
      selectedRoutePath={routePath as string}
      canEdit={canEdit}
    />
  ));
};
