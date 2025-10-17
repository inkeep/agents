import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { type FC, useRef, useEffect } from 'react';

type DefaultEdgeProps = EdgeProps & {
  data?: { isDelegating: boolean };
};

export const AnimatedCircle: FC<{ edgePath: string }> = ({ edgePath }) => {
  const ref = useRef<SVGAnimateElement>(null);

  // Without this useEffect animation won't start on dynamically rendering this component
  useEffect(() => {
    ref.current?.beginElement();
  }, []);

  return (
    <circle fill="var(--primary)" r="6">
      <animateMotion ref={ref} dur="2s" path={edgePath} />
    </circle>
  );
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
      {data?.isDelegating && <AnimatedCircle edgePath={edgePath} />}
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
