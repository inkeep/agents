import { useState } from 'react';
import { TimelineItem } from '@/components/traces/timeline/timeline-item';
import { buildActivityTree, type TreeNode } from '@/components/traces/timeline/tree-utils';
import type { ActivityItem, ConversationDetail } from '@/components/traces/timeline/types';

interface HierarchicalTimelineProps {
  activities: ActivityItem[];
  onSelect: (a: ActivityItem) => void;
  selectedActivityId?: string | null;
  collapsedAiMessages?: Set<string>;
  onToggleAiMessageCollapse?: (activityId: string) => void;
  allSpanAttributes?: ConversationDetail['allSpanAttributes'];
}

interface TreeNodeItemProps {
  node: TreeNode;
  isLast: boolean;
  onSelect: (a: ActivityItem) => void;
  selectedActivityId?: string | null;
  collapsedAiMessages?: Set<string>;
  onToggleAiMessageCollapse?: (activityId: string) => void;
  collapsedNodes: Set<string>;
  toggleNodeCollapse: (nodeId: string) => void;
}

function TreeNodeItem({
  node,
  isLast,
  onSelect,
  selectedActivityId,
  collapsedAiMessages,
  onToggleAiMessageCollapse,
  collapsedNodes,
  toggleNodeCollapse,
}: TreeNodeItemProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.activity.id);
  const indentSize = 24;

  return (
    <div className="relative">
      <div className="flex items-start">
        <div
          style={{
            width: `${node.depth * indentSize}px`,
            minWidth: `${node.depth * indentSize}px`,
          }}
          className="relative flex-shrink-0"
        >
          {node.depth > 0 && (
            <>
              <div
                className="absolute left-0 top-0 bottom-0 border-l border-border"
                style={{ left: `${(node.depth - 1) * indentSize + 7}px` }}
              />
              <div
                className="absolute top-[16px] border-t border-border"
                style={{
                  left: `${(node.depth - 1) * indentSize + 7}px`,
                  width: `${indentSize - 7}px`,
                }}
              />
            </>
          )}
        </div>

        <div className="flex-1">
          <div className="inline-block w-full">
            <TimelineItem
              activity={node.activity}
              isLast={isLast && node.children.length === 0}
              onSelect={() => onSelect(node.activity)}
              isSelected={selectedActivityId === node.activity.id}
              isAiMessageCollapsed={collapsedAiMessages?.has(node.activity.id) || false}
              onToggleAiMessageCollapse={onToggleAiMessageCollapse}
              hasChildren={hasChildren}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleNodeCollapse(node.activity.id)}
            />
          </div>
        </div>
      </div>

      {!isCollapsed && node.children.length > 0 && (
        <div>
          {node.children.map((child, index) => (
            <TreeNodeItem
              key={`${child.activity.id}-${child.activity.type}-${index}`}
              node={child}
              isLast={index === node.children.length - 1}
              onSelect={onSelect}
              selectedActivityId={selectedActivityId}
              collapsedAiMessages={collapsedAiMessages}
              onToggleAiMessageCollapse={onToggleAiMessageCollapse}
              collapsedNodes={collapsedNodes}
              toggleNodeCollapse={toggleNodeCollapse}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchicalTimeline({
  activities,
  onSelect,
  selectedActivityId,
  collapsedAiMessages,
  onToggleAiMessageCollapse,
  allSpanAttributes,
}: HierarchicalTimelineProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleNodeCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const spanParentMap: Record<string, string | null> = {};
  if (allSpanAttributes) {
    for (const span of allSpanAttributes) {
      spanParentMap[span.spanId] = span.data.parentSpanID || null;
    }
  }

  const tree = buildActivityTree(activities, spanParentMap);

  return (
    <div className="pt-2 px-6 pb-6">
      <div className="relative space-y-2">
        {tree.map((node, index) => (
          <TreeNodeItem
            key={`${node.activity.id}-${node.activity.type}-${index}`}
            node={node}
            isLast={index === tree.length - 1}
            onSelect={onSelect}
            selectedActivityId={selectedActivityId}
            collapsedAiMessages={collapsedAiMessages}
            onToggleAiMessageCollapse={onToggleAiMessageCollapse}
            collapsedNodes={collapsedNodes}
            toggleNodeCollapse={toggleNodeCollapse}
          />
        ))}
      </div>
    </div>
  );
}
