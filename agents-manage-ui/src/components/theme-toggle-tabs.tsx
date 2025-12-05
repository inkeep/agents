'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { type ComponentProps, type FC, useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ThemeValue = 'dark' | 'light' | 'system';

const ThemeMap: Record<ThemeValue, FC<ComponentProps<'svg'>>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export const ThemeToggleTabs: FC = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
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
