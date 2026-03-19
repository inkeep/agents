import type { SkillFileRecord } from '@/lib/utils/skill-files';

export interface DemoTreeNode {
  name: string;
  path: string;
  routePath?: string;
  skillId?: string;
  skillName?: string;
  filePath?: string;
  fileId?: string;
  kind: 'folder' | 'file';
  content?: string;
  children: DemoTreeNode[];
}

export function buildTree(files: readonly SkillFileRecord[]): DemoTreeNode[] {
  const root: DemoTreeNode[] = [];

  for (const file of files) {
    const segments = file.treePath.split('/').filter(Boolean);
    let children = root;

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/');
      const isFile = index === segments.length - 1;
      let node = children.find((child) => child.path === path);

      if (!node) {
        node = {
          name: segment,
          path,
          routePath: isFile ? file.routePath : undefined,
          skillId: file.skillId,
          skillName: file.skillName,
          filePath: isFile ? file.filePath : undefined,
          fileId: isFile ? file.fileId : undefined,
          kind: isFile ? 'file' : 'folder',
          content: isFile ? file.content : undefined,
          children: [],
        };
        children.push(node);
      }

      if (isFile) {
        node.routePath = file.routePath;
        node.skillId = file.skillId;
        node.skillName = file.skillName;
        node.filePath = file.filePath;
        node.fileId = file.fileId;
        node.content = file.content;
      }

      children = node.children;
    }
  }

  return root;
}

export function findNodeByRoutePath(
  nodes: readonly DemoTreeNode[],
  targetRoutePath: string
): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.routePath === targetRoutePath) {
      return node;
    }

    const childMatch = findNodeByRoutePath(node.children, targetRoutePath);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

export function findFirstFile(nodes: readonly DemoTreeNode[]): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node;
    }

    const childMatch = findFirstFile(node.children);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}
