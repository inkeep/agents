import { Button, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import { emailColors } from '../theme.js';

interface EmailButtonProps {
  href: string;
  children: ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <>
      <Button
        href={href}
        className="rounded-[8px] px-[24px] py-[12px] text-[14px] font-semibold text-white no-underline text-center"
        style={{ backgroundColor: emailColors.brand }}
      >
        {children}
      </Button>
      <Text className="text-email-text-muted text-[12px] leading-[16px] mt-[16px] break-all font-mono">
        {href}
      </Text>
    </>
  );
}
