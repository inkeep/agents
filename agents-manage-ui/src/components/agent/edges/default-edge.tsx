import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { type FC, useEffect, useRef } from 'react';

type DefaultEdgeProps = EdgeProps & {
  data?: {
    delegating: boolean | 'inverted';
  };
};

export const AnimatedCircle: FC<{ edgePath: string; inverted: boolean }> = ({
  edgePath,
  inverted,
}) => {
  const ref = useRef<SVGAnimateElement>(null);

  // Without this useEffect, the animation won't start when this component is rendered dynamically.
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need restart animation when invert is changed
  useEffect(() => {
    ref.current?.beginElement();
  }, [inverted]);

  return (
    <circle fill="var(--primary)" r="6">
      <animateMotion
        ref={ref}
        dur="2s"
        path={edgePath}
        fill="freeze"
        {...(inverted && {
          pathLength: '1',
          keyPoints: '1;0',
          keyTimes: '0;1',
        })}
      />
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
    selected || data?.delegating
      ? '!stroke-primary'
      : '!stroke-border dark:!stroke-muted-foreground';

  return (
    <>
      {/* Animated circles based on delegating direction */}
      {data?.delegating && (
        <AnimatedCircle edgePath={edgePath} inverted={data.delegating === 'inverted'} />
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
