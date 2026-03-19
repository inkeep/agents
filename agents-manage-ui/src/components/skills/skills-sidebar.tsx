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
  const { fileSlug, skillId } = useParams<{ fileSlug?: string[]; skillId?: string }>();
  const routeToken = fileSlug?.join('/');
  const requestedRoutePath = routeToken
    ? (fileRouteAliases[routeToken] ?? routeToken)
    : skillId || '';
  const selectedNode =
    (requestedRoutePath ? findNodeByRoutePath(treeNodes, requestedRoutePath) : null) ??
    findFirstFile(treeNodes) ??
    null;
  const selectedRoutePath = selectedNode?.routePath ?? '';

  return treeNodes.map((node) => (
    <TreeNode
      key={node.path}
      node={node}
      selectedRoutePath={selectedRoutePath}
      canEdit={canEdit}
    />
  ));
};
