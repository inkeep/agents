import type { ActivityItem } from './types';

export interface TreeNode {
  activity: ActivityItem;
  children: TreeNode[];
  depth: number;
}

export function buildActivityTree(activities: ActivityItem[]): TreeNode[] {
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

  for (const activity of sortedActivities) {
    const node = nodeMap.get(activity.id);
    if (!node) continue;

    // activity.parentSpanId is already resolved to nearest ancestor activity by API route
    const parentSpanId = activity.parentSpanId;

    if (parentSpanId && nodeMap.has(parentSpanId)) {
      const parent = nodeMap.get(parentSpanId);
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
      (a, b) => new Date(a.activity.timestamp).getTime() - new Date(b.activity.timestamp).getTime()
    );
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  for (const root of rootNodes) {
    sortChildren(root);
  }

  rootNodes.sort(
    (a, b) => new Date(a.activity.timestamp).getTime() - new Date(b.activity.timestamp).getTime()
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
