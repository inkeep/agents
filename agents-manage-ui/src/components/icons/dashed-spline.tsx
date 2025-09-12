import { forwardRef } from 'react';
import { type IconComponentProps, SvgIcon } from '@/components/ui/svg-icon';

export const DashedSplineIcon = forwardRef<SVGSVGElement, IconComponentProps>((props, ref) => (
  <SvgIcon ref={ref} {...props}>
    <path
      d="M19 7C20.1046 7 21 6.10457 21 5C21 3.89543 20.1046 3 19 3C17.8954 3 17 3.89543 17 5C17 6.10457 17.8954 7 19 7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 21C6.10457 21 7 20.1046 7 19C7 17.8954 6.10457 17 5 17C3.89543 17 3 17.8954 3 19C3 20.1046 3.89543 21 5 21Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 17C5 13.8174 6.26428 10.7652 8.51472 8.51472C10.7652 6.26428 13.8174 5 17 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="4 4"
    />
  </SvgIcon>
));

DashedSplineIcon.displayName = 'DashedSplineIcon';
