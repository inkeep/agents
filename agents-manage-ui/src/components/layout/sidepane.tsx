'use client';

import { ArrowLeft, X } from 'lucide-react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidePaneRootProps {
  isOpen: boolean;
  children: React.ReactNode;
}

interface SidePaneHeaderProps {
  children: React.ReactNode;
}

interface SidePaneContentProps {
  children: React.ReactNode;
}

function SidePaneRoot({ isOpen, children }: SidePaneRootProps) {
  return (
    <div
      className={`relative top-0 right-0 bg-background h-full flex flex-col rounded-br-[14px] transform transition-transform duration-300 ease-in-out group z-50 ${isOpen ? 'translate-x-0 w-[480px]' : 'translate-x-full w-0'}`}
    >
      {children}
    </div>
  );
}

function SidePaneHeader({ children }: SidePaneHeaderProps) {
  return (
    <div className="flex flex-row items-center justify-between px-6 py-2 border-l border-b flex-shrink-0 relative">
      {children}
    </div>
  );
}

function SidePaneContent({ children }: SidePaneContentProps) {
  return (
    <ScrollArea className="border-l border-border flex-1 h-0 [&>div>div]:table-fixed [&>div>div]:w-full">
      <div className="p-6">{children}</div>
    </ScrollArea>
  );
}

function SidePaneCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      className="-mr-1 text-foreground hover:text-foreground dark:text-foreground dark:hover:text-foreground"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </Button>
  );
}

function SidePaneBackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      className="-ml-1 transition-all duration-300 ease-in-out absolute left-0 opacity-0 -translate-x-6 group-hover:opacity-100 group-hover:translate-x-0 text-foreground hover:text-foreground dark:text-foreground dark:hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="sr-only">Back</span>
    </Button>
  );
}

export const SidePane = {
  Root: SidePaneRoot,
  Header: SidePaneHeader,
  Content: SidePaneContent,
  CloseButton: SidePaneCloseButton,
  BackButton: SidePaneBackButton,
};
