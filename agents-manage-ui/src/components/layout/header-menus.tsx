'use client';

import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { DOCS_BASE_URL, MONACO_THEME_NAME } from '@/constants/theme';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { useAuthSession } from '@/hooks/use-auth';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { UserMenu } from '../auth/user-menu';
import { ThemeToggle } from '../theme-toggle';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';

export function HeaderMenus() {
  const { user, isLoading } = useAuthSession();
  const { resolvedTheme } = useTheme();
  const isMounted = useIsMounted();
  const monaco = useMonacoStore((state) => state.monaco);
  const { tenantId } = useParams<{ tenantId: string }>();

  useEffect(() => {
    const isDark = resolvedTheme === 'dark';
    const monacoTheme = isDark ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
    monaco?.editor.setTheme(monacoTheme);
  }, [resolvedTheme, monaco]);

  const supportSubject = encodeURIComponent('Support with Inkeep Agents');
  const supportBody = encodeURIComponent(
    `Hi Inkeep team,\n\nCan you help me with <X>.\n\n---\nTenant: ${tenantId ?? ''}`
  );
  const supportMailto = `mailto:support@inkeep.com?subject=${supportSubject}&body=${supportBody}`;

  if (!isMounted || isLoading) {
    return <Skeleton className="h-7 w-7" />;
  }

  return (
    <div className="ml-auto flex items-center gap-1">
      <a
        href={supportMailto}
        className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
      >
        Help
      </a>
      <a
        href={DOCS_BASE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted-foreground hover:text-foreground px-2 py-1"
      >
        Docs
      </a>
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      {user ? <UserMenu /> : <ThemeToggle />}
    </div>
  );
}
