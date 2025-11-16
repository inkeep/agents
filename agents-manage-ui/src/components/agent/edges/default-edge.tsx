'use client';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { type FC, useEffect, useRef } from 'react';
import type { AnimatedEdge } from '../configuration/edge-types';

export const AnimatedCircle: FC<{ edgePath: string } & AnimatedEdge> = ({ edgePath, status }) => {
  const ref = useRef<SVGAnimateElement>(null);

  // Without this useEffect, the animation won't start when this component is rendered dynamically.
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need restart animation when invert is changed
  useEffect(() => {
    ref.current?.beginElement();
  }, [status]);

  if (!status) {
    return;
  }

  return (
    <circle fill="var(--primary)" r="6">
      <animateMotion
        ref={ref}
        dur="2s"
        path={edgePath}
        fill="freeze"
        {...(status === 'inverted-delegating' && {
          keyPoints: '1;0',
          keyTimes: '0;1',
        })}
      />
    </circle>
  );
};

interface DefaultEdgeProps extends Omit<EdgeProps, 'data'> {
  data?: AnimatedEdge;
}

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
  data = {},
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
    selected || data.status ? '!stroke-primary' : '!stroke-border dark:!stroke-muted-foreground';

  return (
    <>
      {/* Animated circles based on delegating direction */}
      <AnimatedCircle edgePath={edgePath} status={data.status} />
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
