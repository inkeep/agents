'use client';

import type { FC } from 'react';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';

interface ReadOnlyJsonViewProps {
  value: string;
  className?: string;
  maxHeight?: string;
}

export const ReadOnlyJsonView: FC<ReadOnlyJsonViewProps> = ({
  value,
  className,
  maxHeight = '200px',
}) => {
  const markdown = `\`\`\`json\n${value}\n\`\`\``;

  return (
    <div
      className={cn(
        'overflow-auto rounded-md border border-input text-xs [&_pre]:!m-0 [&_pre]:!rounded-md [&_pre]:!border-0 [&_code]:!text-xs',
        className,
      )}
      style={{ maxHeight }}
    >
      <Streamdown>{markdown}</Streamdown>
    </div>
  );
};
