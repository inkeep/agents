export interface DemoTreeNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  content?: string;
  children: DemoTreeNode[];
}

export type SkillFileTreeItem = {
  filePath: string;
  content: string;
};

export function buildTree(files: readonly SkillFileTreeItem[]): DemoTreeNode[] {
  const root: DemoTreeNode[] = [];

  for (const file of files) {
    const segments = file.filePath.split('/').filter(Boolean);
    let children = root;

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/');
      const isFile = index === segments.length - 1;
      let node = children.find((child) => child.path === path);

      if (!node) {
        node = {
          name: segment,
          path,
          kind: isFile ? 'file' : 'folder',
          content: isFile ? file.content : undefined,
          children: [],
        };
        children.push(node);
      }

      if (isFile) {
        node.content = file.content;
      }

      children = node.children;
    }
  }

  return root;
}

export function getSkillFiles(
  skills: Array<{
    id: string;
    files?: Array<{
      filePath: string;
      content: string;
    }>;
  }>
): SkillFileTreeItem[] {
  return skills.flatMap((skill) =>
    (skill.files ?? []).map((file) => ({
      filePath: `${skill.id}/${file.filePath}`,
      content: file.content,
    }))
  );
}

export function findNodeByPath(
  nodes: readonly DemoTreeNode[],
  targetPath: string
): DemoTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    const childMatch = findNodeByPath(node.children, targetPath);
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
