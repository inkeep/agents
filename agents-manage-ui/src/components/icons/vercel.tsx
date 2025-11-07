import { forwardRef } from 'react';
import { type IconComponentProps, SvgIcon } from '@/components/ui/svg-icon';

export const VercelIcon = forwardRef<SVGSVGElement, IconComponentProps>((props, ref) => (
  <SvgIcon ref={ref} {...props} strokeWidth={0}>
    <title>Vercel icon</title>
    <g clip-path="url(#clip0_24_207)">
      <path d="M11.9573 1.5L23.9146 22.2109H0L11.9573 1.5Z" fill="currentColor" />
    </g>
    <defs></defs>
  </SvgIcon>
));

VercelIcon.displayName = 'VercelIcon';
