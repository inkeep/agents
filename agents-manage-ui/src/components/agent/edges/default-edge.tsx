'use client';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { type FC, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AnimatedEdge } from '../configuration/edge-types';

export const AnimatedCircle: FC<{ edgePath: string } & AnimatedEdge> = ({ edgePath, status }) => {
  const motionRef = useRef<SVGAnimateMotionElement>(null);
  const opacityRef = useRef<SVGAnimateElement>(null);

  // Without this useEffect, the animation won't start when this component is rendered dynamically.
  // biome-ignore lint/correctness/useExhaustiveDependencies: We need restart animation when invert is changed
  useEffect(() => {
    motionRef.current?.beginElement();
    opacityRef.current?.beginElement();
  }, [status]);

  if (!status) {
    return;
  }

  const isInverted = status === 'inverted-delegating';
  const dur = '2s';

  return (
    <circle fill="var(--primary)" r="6" opacity={isInverted ? 0 : 100}>
      <animateMotion
        ref={motionRef}
        dur={dur}
        path={edgePath}
        fill={isInverted ? 'remove' : 'freeze'}
        {...(isInverted && { keyPoints: '1;0', keyTimes: '0;1' })}
      />
      {isInverted && (
        <animate
          ref={opacityRef}
          dur={dur}
          attributeName="opacity"
          values="1;1;0"
          keyTimes="0;0.95;1"
        />
      )}
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
        className={cn(
          data.status && 'edge-delegating',
          data.status === 'inverted-delegating' && 'edge-delegating-inverted'
        )}
      />
    </>
  );
}
