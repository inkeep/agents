import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Stepper({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="stepper" className={cn('relative', className)} {...props} />;
}

function StepperItem({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="stepper-item"
      className={cn('group/step relative flex gap-3', className)}
      {...props}
    />
  );
}

function StepperIndicator({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="stepper-indicator"
      className={cn('flex flex-col items-center', className)}
      {...props}
    >
      <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold font-mono text-muted-foreground">
        {children}
      </span>
      <div className="w-px flex-1 bg-border group-last/step:hidden" />
    </div>
  );
}

function StepperContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="stepper-content"
      className={cn('flex-1 space-y-3 pb-6 group-last/step:pb-0', className)}
      {...props}
    />
  );
}

function StepperTitle({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="stepper-title"
      className={cn('font-medium text-[15px] leading-6 text-foreground', className)}
      {...props}
    />
  );
}

function StepperDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="stepper-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Stepper, StepperItem, StepperIndicator, StepperContent, StepperTitle, StepperDescription };
