'use client';

import type { VariantProps } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';
import { Button, type buttonVariants } from './button';

interface CopyButtonProps extends VariantProps<typeof buttonVariants> {
  textToCopy: string;
  className?: string;
  iconClassName?: string;
}

export function CopyButton({
  textToCopy,
  className,
  variant = 'ghost',
  size = 'icon-sm',
  iconClassName,
}: CopyButtonProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({});
  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'backdrop-blur-sm bg-card/90 hover:bg-card border border-border shadow-sm',
        className
      )}
      onClick={() => copyToClipboard(textToCopy)}
    >
      {isCopied ? (
        <Check className={cn('w-4 h-4 text-green-600 dark:text-green-400', iconClassName)} />
      ) : (
        <Copy
          className={cn('!w-3 !h-3 text-muted-foreground dark:text-foreground', iconClassName)}
        />
      )}
      <span className="sr-only">Copy</span>
    </Button>
  );
}
