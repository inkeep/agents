'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const toastOverrideStyles = `
[data-sonner-toaster][dir="ltr"] {
  --toast-close-button-start: auto !important;
  --toast-close-button-end: 0 !important;
  --toast-close-button-transform: translate(35%, -35%) !important;
}
[data-sonner-toaster][dir="rtl"] {
  --toast-close-button-start: 0 !important;
  --toast-close-button-end: auto !important;
  --toast-close-button-transform: translate(-35%, -35%) !important;
}
`;

const Toaster = (props: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: toastOverrideStyles }} />
      <Sonner
        theme={resolvedTheme as ToasterProps['theme']}
        className="toaster group"
        style={{
          ['--normal-bg' as string]: 'var(--popover)',
          ['--normal-text' as string]: 'var(--popover-foreground)',
          ['--normal-border' as string]: 'var(--border)',
        }}
        {...props}
      />
    </>
  );
};

export { Toaster };
