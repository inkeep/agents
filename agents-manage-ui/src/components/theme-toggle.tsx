'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { type ComponentProps, type FC, type MouseEventHandler, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ThemeValue = 'dark' | 'light' | 'system';

const ThemeMap: Record<ThemeValue, FC<ComponentProps<'svg'>>> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

export const ThemeToggle: FC = () => {
  const { setTheme } = useTheme();

  const handleTheme = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const newTheme = event.currentTarget.dataset.theme as ThemeValue;
      setTheme(newTheme);
    },
    [setTheme]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 dark:text-sidebar-foreground"
        >
          <Sun className="dark:hidden" />
          <Moon className="not-dark:hidden" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(ThemeMap).map(([theme, Comp]) => (
          <DropdownMenuItem
            key={theme}
            data-theme={theme}
            onClick={handleTheme}
            className="capitalize gap-4"
          >
            <Comp />
            {theme}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
