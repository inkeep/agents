import type { ActivityItem } from './types';

export interface TreeNode {
  activity: ActivityItem;
  children: TreeNode[];
  depth: number;
}

interface SpanParentMap {
  [spanId: string]: string | null;
}

export function buildActivityTree(
  activities: ActivityItem[],
  spanParentMap?: SpanParentMap
): TreeNode[] {
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const nodeMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];
  const activityIndexMap = new Map<string, number>();

  for (let i = 0; i < sortedActivities.length; i++) {
    const activity = sortedActivities[i];
    activityIndexMap.set(activity.id, i);
    nodeMap.set(activity.id, {
      activity,
      children: [],
      depth: 0,
    });
  }

  function findAncestorInActivities(spanId: string | null | undefined): string | null {
    if (!spanId) return null;
    
    if (nodeMap.has(spanId)) {
      return spanId;
    }
    
    if (spanParentMap && spanParentMap[spanId]) {
      return findAncestorInActivities(spanParentMap[spanId]);
    }
    
    return null;
  }

  for (const activity of sortedActivities) {
    const node = nodeMap.get(activity.id);
    if (!node) continue;

    const ancestorSpanId = findAncestorInActivities(activity.parentSpanId);
    
    if (ancestorSpanId && nodeMap.has(ancestorSpanId)) {
      const parent = nodeMap.get(ancestorSpanId);
      if (parent) {
        parent.children.push(node);
        node.depth = parent.depth + 1;
      }
    } else {
      rootNodes.push(node);
    }
  }

  function sortChildren(node: TreeNode) {
    node.children.sort(
      (a, b) =>
        new Date(a.activity.timestamp).getTime() - new Date(b.activity.timestamp).getTime()
    );
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  for (const root of rootNodes) {
    sortChildren(root);
  }

  rootNodes.sort(
    (a, b) =>
      new Date(a.activity.timestamp).getTime() - new Date(b.activity.timestamp).getTime()
  );

  return rootNodes;
}

export function flattenTree(nodes: TreeNode[]): ActivityItem[] {
  const result: ActivityItem[] = [];

  function traverse(node: TreeNode) {
    result.push(node.activity);
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

