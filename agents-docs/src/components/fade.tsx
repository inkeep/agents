import { cn } from '@/lib/utils';

interface FadeProps {
  className?: string;
}

export const Fade = ({ className }: FadeProps) => {
  return (
    <div
      className={cn(
        'pointer-events-none w-full h-6 absolute top-full left-[1px] right-0 -z-10 bg-gradient-to-b from-[hsl(var(--background))] ',
        className
      )}
    />
  );
};
