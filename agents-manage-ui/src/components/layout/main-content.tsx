import { cn } from '@/lib/utils';

type MainContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function MainContent({ children, className }: MainContentProps) {
  return (
    <div className={cn('flex flex-col gap-6 max-w-7xl mx-auto w-full', className)}>
      {children}
    </div>
  );
}

