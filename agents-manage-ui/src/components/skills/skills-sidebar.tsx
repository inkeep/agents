'use client';

import { useParams } from 'next/navigation';
import type { FC } from 'react';
import { TreeNode } from '@/components/skills/tree-node';
import {
  type DemoTreeNode,
  findFirstFile,
  findNodeByPath,
  findNodeByRoutePath,
} from '@/components/skills/tree-utils';

interface SkillsSidebarProps {
  treeNodes: DemoTreeNode[];
  fileRouteAliases: Record<string, string>;
}

export const SkillsSidebar: FC<SkillsSidebarProps> = ({ treeNodes, fileRouteAliases }) => {
  const { fileSlug, folderSlug, parentPath, skillId } = useParams<{
    fileSlug?: string[];
    folderSlug?: string[];
    parentPath?: string[];
    skillId?: string;
  }>();
  const fileRouteToken = fileSlug?.join('/');
  const requestedRoutePath = fileRouteToken
    ? (fileRouteAliases[fileRouteToken] ?? fileRouteToken)
    : '';
  const requestedFolderPath =
    folderSlug?.join('/') ??
    (skillId ? [skillId, parentPath?.join('/')].filter(Boolean).join('/') : '');
  const selectedNode =
    (requestedRoutePath ? findNodeByRoutePath(treeNodes, requestedRoutePath) : null) ??
    (requestedFolderPath ? findNodeByPath(treeNodes, requestedFolderPath) : null) ??
    findFirstFile(treeNodes) ??
    null;
  const selectedNodePath = selectedNode?.path ?? '';

  return treeNodes.map((node) => (
    <TreeNode key={node.path} node={node} selectedNodePath={selectedNodePath} />
  ));
};
