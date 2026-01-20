import type { LucideProps } from 'lucide-react';
import type { FC } from 'react';

const defaultAttributes = {
  fill: 'none',
  height: 24,
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
  width: 24,
  xmlns: 'http://www.w3.org/2000/svg',
};

export type IconComponentProps = LucideProps;

export const SvgIcon: FC<IconComponentProps> = ({
  color = 'currentColor',
  size = 24,
  strokeWidth = 2,
  absoluteStrokeWidth,
  className = '',
  children,
  ...props
}) => (
  <svg
    role="img"
    aria-label="SVG Icon"
    {...defaultAttributes}
    className={className}
    height={size}
    stroke={color}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth}
    width={size}
    {...props}
  >
    {children}
  </svg>
);
