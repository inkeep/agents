import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

type AnimatedCirclesEdgeProps = EdgeProps;

export function AnimatedCirclesEdge({
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
}: AnimatedCirclesEdgeProps) {
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
      <defs>
        {/* Define the path for the moving circles */}
        <path id={`path-${id}`} d={edgePath} fill="none" />
      </defs>
      
      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        label={label}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 2,
        }}
        className={`${selected ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground'}`}
      />
      
      {/* Animated circle - always show for this edge type */}
      <circle 
        fill="var(--primary)" 
        r="4"
      >
        <animateMotion 
          dur="2s" 
          path={edgePath} 
          repeatCount="indefinite"
        />
      </circle>
    </>
  );
}
