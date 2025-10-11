import { BaseEdge, EdgeLabelRenderer, type EdgeProps, type Node, useStore } from '@xyflow/react';
import { RefreshCw } from 'lucide-react';
import type { A2AEdgeData } from '../configuration/edge-types';

interface SelfLoopEdgeProps extends EdgeProps {
  data?: A2AEdgeData;
}

const getNodePositionById = (nodeId: string): ((state: { nodes: Node[] }) => Node | undefined) => {
  return (state) => state.nodes.find((n: Node) => n.id === nodeId);
};

export function SelfLoopEdge({ source, data, selected }: SelfLoopEdgeProps) {
  const sourceNode = useStore(getNodePositionById(source));

  if (!sourceNode) return null;

  const relationships = data?.relationships || {
    transferTargetToSource: false,
    transferSourceToTarget: false,
    delegateTargetToSource: false,
    delegateSourceToTarget: false,
  };

  const hasDelegate = relationships.delegateTargetToSource || relationships.delegateSourceToTarget;
  const hasTransfer = relationships.transferTargetToSource || relationships.transferSourceToTarget;

  // Calculate loop dimensions based on node position
  const nodeX = sourceNode.position.x;
  const nodeY = sourceNode.position.y;
  const nodeWidth = sourceNode.width || 300; // Default width from NODE_WIDTH
  const nodeHeight = sourceNode.height || 150; // Default height

  // Loop parameters
  const loopRadius = 40;

  // Center position of the node
  const centerX = nodeX + nodeWidth / 2;
  const centerY = nodeY + nodeHeight / 2;

  // Control points for the loop
  const startX = centerX + nodeWidth / 2;
  const startY = centerY - 10;
  const endX = centerX + nodeWidth / 2;
  const endY = centerY + 10;

  // Create a smooth self-loop path
  const transferPath = `
		M ${startX} ${startY}
		C ${startX + loopRadius * 2} ${startY - loopRadius},
		  ${endX + loopRadius * 2} ${endY + loopRadius},
		  ${endX} ${endY}
	`;

  // Slightly offset path for delegate (dashed line)
  const delegatePath = `
		M ${startX - 5} ${startY}
		C ${startX + loopRadius * 2 - 5} ${startY - loopRadius - 5},
		  ${endX + loopRadius * 2 - 5} ${endY + loopRadius + 5},
		  ${endX - 5} ${endY}
	`;

  const getMarker = (isSelected: boolean) =>
    isSelected ? 'url(#marker-selected)' : 'url(#marker-default)';

  // For self-loops, both transfer and delegate point in the same direction
  const transferMarkerEnd = hasTransfer ? getMarker(!!selected) : undefined;
  const delegateMarkerEnd = hasDelegate ? getMarker(!!selected) : undefined;

  // Icon position (at the top of the loop)
  const iconX = centerX + nodeWidth / 2 + loopRadius;
  const iconY = centerY - loopRadius;

  return (
    <>
      {/* Render transfer path (solid line) */}
      {hasTransfer && (
        <BaseEdge
          className={`${selected ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground'}`}
          path={transferPath}
          style={{
            strokeWidth: 2,
            fill: 'none',
          }}
          markerEnd={transferMarkerEnd}
        />
      )}

      {/* Render delegate path (dashed line) */}
      {hasDelegate && (
        <BaseEdge
          className={`${selected ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground'}`}
          path={hasTransfer ? delegatePath : transferPath}
          style={{
            strokeDasharray: '5,5',
            strokeWidth: 2,
            fill: 'none',
          }}
          markerEnd={delegateMarkerEnd}
        />
      )}

      {/* Don't render anything if there are no relationships */}

      {/* Icon label */}
      {(hasTransfer || hasDelegate) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${iconX}px,${iconY}px)`,
              pointerEvents: 'none',
            }}
          >
            <div className="w-6 h-6 bg-background border rounded-full flex items-center justify-center border-border">
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
