import type { FC } from 'react';
import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

export const AnimatedCirclesEdge: FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  markerEnd,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Define the path for the moving circles */}
      <defs>
        <path id={`path-${id}`} d={edgePath} fill="none" />
      </defs>

      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        label={label}
        markerEnd={markerEnd}
        style={{ strokeWidth: 2 }}
        className={selected ? '!stroke-primary' : 'dark:!stroke-muted-foreground'}
      />

      {/* Animated circle - always show for this edge type */}
      <circle fill="var(--primary)" r="4">
        <animateMotion dur="2s" path={edgePath} repeatCount="indefinite" />
      </circle>
    </>
  );
};
