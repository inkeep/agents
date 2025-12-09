'use client';

import { useTheme } from 'next-themes';
import type { FC } from 'react';
import { ThemeMap } from '@/components/theme-toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMounted } from '@/hooks/use-is-mounted';

export const ThemeToggleTabs: FC = () => {
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return (
    <Tabs value={theme} onValueChange={setTheme}>
      <TabsList className="flex h-[unset] w-fit gap-1">
        {Object.entries(ThemeMap).map(([themeValue, Icon]) => (
          <TabsTrigger
            key={themeValue}
            value={themeValue}
            className="gap-1 size-7 dark:data-[state=active]:bg-white/15"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="sr-only">{themeValue}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
