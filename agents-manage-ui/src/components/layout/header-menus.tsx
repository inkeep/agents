'use client';

import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { type FC, useEffect } from 'react';
import { DOCS_BASE_URL, MONACO_THEME_NAME } from '@/constants/theme';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { useAuthSession } from '@/hooks/use-auth';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';

function getMailUrl(tenantId: string): string {
  const params = Object.entries({
    subject: 'Support with Inkeep Agents',
    body: `Hi Inkeep team,

Can you help me with <X>.

---
Tenant: ${tenantId}`,
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `mailto:support@inkeep.com?${params}`;
}

export const HeaderMenus: FC = () => {
  'use memo';

  const { user, isLoading } = useAuthSession();
  const { resolvedTheme } = useTheme();
  const isMounted = useIsMounted();
  const monaco = useMonacoStore((state) => state.monaco);
  const { tenantId } = useParams<{ tenantId: string }>();
  const isDark = resolvedTheme === 'dark';
  const IconToUse = user ? UserMenu : ThemeToggle;

  useEffect(() => {
    const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
    monaco?.editor.setTheme(monacoTheme);
  }, [isDark, monaco]);

  return (
    <div className="ml-auto flex items-center gap-1">
      {[
        { href: getMailUrl(tenantId), title: 'Help' },
        { href: DOCS_BASE_URL, title: 'Docs' },
      ].map(({ href, title }) => (
        <a
          key={title}
          href={href}
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none px-2 py-1 rounded-sm"
          {...(href.startsWith('https://') && {
            target: '_blank',
            rel: 'noopener noreferrer',
          })}
        >
          {title}
        </a>
      ))}
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      {!isMounted || isLoading ? <Skeleton className="h-7 w-7" /> : <IconToUse />}
    </div>
  );
};
