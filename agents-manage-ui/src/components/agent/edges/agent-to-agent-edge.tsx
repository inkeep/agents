import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import type { A2AEdgeData } from '../configuration/edge-types';

interface AgentToAgentEdgeProps extends EdgeProps {
  data?: A2AEdgeData;
}

export function AgentToAgentEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: AgentToAgentEdgeProps) {
  const relationships = data?.relationships || {
    transferTargetToSource: false,
    transferSourceToTarget: false,
    delegateTargetToSource: false,
    delegateSourceToTarget: false,
  };

  const hasDelegate = relationships.delegateTargetToSource || relationships.delegateSourceToTarget;
  const hasTransfer = relationships.transferTargetToSource || relationships.transferSourceToTarget;

  // Calculate offset for multiple paths
  const calculateOffsetPath = (offset: number) => {
    // Calculate perpendicular offset
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / length;
    const unitY = dy / length;

    // Perpendicular vector
    const perpX = -unitY * offset;
    const perpY = unitX * offset;

    return getBezierPath({
      sourceX: sourceX + perpX,
      sourceY: sourceY + perpY,
      targetX: targetX + perpX,
      targetY: targetY + perpY,
      targetPosition,
      sourcePosition,
    });
  };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    targetPosition,
    sourcePosition,
  });

  let PrimaryIcon = null;
  const hasSourceToTarget =
    relationships.transferSourceToTarget || relationships.delegateSourceToTarget;
  const hasTargetToSource =
    relationships.transferTargetToSource || relationships.delegateTargetToSource;

  if (hasSourceToTarget && hasTargetToSource) {
    PrimaryIcon = ArrowRightLeft;
  } else if (hasTransfer) {
    PrimaryIcon = ArrowRight;
  } else if (hasDelegate) {
    PrimaryIcon = ArrowRight;
  }

  const getMarker = (isSelected: boolean) =>
    isSelected ? 'url(#marker-selected)' : 'url(#marker-default)';

  // Determine markers based on relationship directions
  const transferMarkerStart =
    hasTransfer && relationships.transferTargetToSource ? getMarker(!!selected) : undefined;
  const transferMarkerEnd =
    hasTransfer && relationships.transferSourceToTarget ? getMarker(!!selected) : undefined;

  const delegateMarkerStart =
    hasDelegate && relationships.delegateTargetToSource ? getMarker(!!selected) : undefined;
  const delegateMarkerEnd =
    hasDelegate && relationships.delegateSourceToTarget ? getMarker(!!selected) : undefined;

  return (
    <>
      {/* Render transfer path (solid line) */}
      {hasTransfer && (
        <BaseEdge
          className={`${selected ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground'}`}
          path={hasDelegate ? calculateOffsetPath(-3)[0] : edgePath}
          style={{
            strokeWidth: 2,
          }}
          markerEnd={transferMarkerEnd}
          markerStart={transferMarkerStart}
        />
      )}

      {/* Render delegate path (dashed line) */}
      {hasDelegate && (
        <BaseEdge
          className={`${selected ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground'}`}
          path={hasTransfer ? calculateOffsetPath(3)[0] : edgePath}
          style={{
            strokeDasharray: '5,5',
            strokeWidth: 2,
          }}
          markerEnd={delegateMarkerEnd}
          markerStart={delegateMarkerStart}
        />
      )}

      {/* Don't render anything if there are no relationships */}
      {PrimaryIcon && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <div className="w-6 h-6 bg-background border rounded-full flex items-center justify-center border-border">
              <PrimaryIcon className="w-3 h-3 text-muted-foreground" />
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
