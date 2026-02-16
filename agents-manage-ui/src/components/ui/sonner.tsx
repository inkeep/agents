'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = (props: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps['theme']}
      className="toaster group"
      swipeDirections={[]}
      style={{
        ['--normal-bg' as string]: 'var(--popover)',
        ['--normal-text' as string]: 'var(--popover-foreground)',
        ['--normal-border' as string]: 'var(--border)',
      }}
      {...props}
    />
  );
};

export { Toaster };
