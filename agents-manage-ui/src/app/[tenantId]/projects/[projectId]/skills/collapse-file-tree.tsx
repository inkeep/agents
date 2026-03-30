'use client';

import type { FC } from 'react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const CollapseFileTree: FC = () => {
  const { state } = useSidebar();

  const text = `${state === 'collapsed' ? 'Expand' : 'Collapse'} file tree`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground hover:bg-accent dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-accent/50" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
};
