import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

type DefaultEdgeProps = EdgeProps;

export function DefaultEdge({
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
}: DefaultEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
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
  );
}
