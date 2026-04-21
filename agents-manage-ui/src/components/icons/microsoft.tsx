import type { FC } from 'react';
import { type IconComponentProps, SvgIcon } from '@/components/ui/svg-icon';

export const MicrosoftColorIcon: FC<IconComponentProps> = (props) => (
  <SvgIcon {...props} strokeWidth={0} viewBox="0 0 23 23">
    <title>Microsoft icon</title>
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </SvgIcon>
);
