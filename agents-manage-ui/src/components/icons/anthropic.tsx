import { forwardRef } from 'react';
import { type IconComponentProps, SvgIcon } from '@/components/ui/svg-icon';

export const AnthropicIcon = forwardRef<SVGSVGElement, IconComponentProps>((props, ref) => (
  <SvgIcon ref={ref} {...props} strokeWidth={0}>
    <title>Anthropic icon</title>
    <g clipPath="url(#clip0_22_178)">
      <path
        d="M17.3102 3.5H13.6399L20.3297 20.4197H24L17.3102 3.5ZM6.68981 3.5L0 20.4197H3.74837L5.12798 16.8796H12.1302L13.4837 20.4197H17.2321L10.5423 3.5H6.68981ZM6.32538 13.7299L8.61605 7.79501L10.9067 13.7299H6.32538Z"
        fill="#181818"
      />
    </g>
    <defs>
      <clipPath id="clip0_22_178">
        <rect width="24" height="16.9197" fill="white" transform="translate(0 3.5)" />
      </clipPath>
    </defs>
  </SvgIcon>
));

AnthropicIcon.displayName = 'AnthropicIcon';
