import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        primary:
          'border border-primary/50 text-primary bg-primary/5 rounded-sm p-0.5 px-1.5 font-mono',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        code: 'text-xs text-muted-foreground border bg-muted/80 dark:bg-muted/50 rounded-sm p-0.5 px-1.5 font-mono',
        success:
          'text-xs text-muted-foreground border rounded-sm p-0.5 px-1.5 font-mono bg-emerald-50 border-emerald-200 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 uppercase',
        error:
          'text-xs text-muted-foreground border rounded-sm p-0.5 px-1.5 font-mono bg-red-50 border-red-200 text-red-800 dark:border-red-700 dark:text-red-300 dark:bg-red-950/40 uppercase',
        warning:
          'text-xs text-muted-foreground border rounded-sm p-0.5 px-1.5 font-mono bg-amber-50 border-amber-200 text-amber-800 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/40 uppercase',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
