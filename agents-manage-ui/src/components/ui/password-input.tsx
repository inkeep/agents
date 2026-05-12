'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  groupClassName?: string;
};

function PasswordInput({ className, groupClassName, disabled, ref, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <InputGroup className={groupClassName}>
      <InputGroupInput
        ref={ref}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={className}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordInput };
