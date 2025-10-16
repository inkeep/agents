import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

type DefaultEdgeProps = EdgeProps & {
  data?: { isDelegating: boolean };
};

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
  data,
}: DefaultEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const className =
    selected || data?.isDelegating
      ? '!stroke-primary'
      : '!stroke-border dark:!stroke-muted-foreground';

  return (
    <>
      {data?.isDelegating && (
        <circle fill="var(--primary)" r="6">
          <animateMotion dur="2s" path={edgePath} repeatCount="indefinite" />
        </circle>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        label={label}
        markerEnd={markerEnd}
        style={{ strokeWidth: 2 }}
        className={className}
      />
    </>
  );
}
