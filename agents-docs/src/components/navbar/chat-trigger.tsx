'use client';

import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import { Button } from '../ui/button';

export function ChatToggle(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      type="button"
      variant="outline"
      id="chat-trigger"
      size="sm"
      {...props}
      className={clsx(props.className)}
    >
      Ask AI
    </Button>
  );
}
