'use client';

import { type MouseEventHandler, useCallback, useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MONACO_THEME_NAME } from '@/constants/theme';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    // Dynamically import `monaco-editor` since it relies on `window`, which isn't available during SSR
    import('monaco-editor').then(({ editor }) => {
      const monacoTheme =
        resolvedTheme === 'dark' ? MONACO_THEME_NAME.dark : MONACO_THEME_NAME.light;
      editor.setTheme(monacoTheme);
    });
  }, [resolvedTheme]);

  const handleTheme = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const newTheme = event.currentTarget.dataset.theme as 'dark' | 'light' | 'system';
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
          className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 dark:text-sidebar-foreground"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-theme="light" onClick={handleTheme}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem data-theme="dark" onClick={handleTheme}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem data-theme="system" onClick={handleTheme}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SimpleThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
