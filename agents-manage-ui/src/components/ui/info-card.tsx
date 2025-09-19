import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Button } from './button';

interface InfoCardProps {
  title: string;
  Icon?: LucideIcon;
  children: React.ReactNode;
}

export function InfoCard({ title, Icon, children }: InfoCardProps) {
  return (
    <div className="text-xs text-gray-800 dark:text-muted-foreground p-3 bg-gray-100/80 dark:bg-sidebar rounded-md">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
        <p className="font-medium text-foreground font-mono uppercase">{title}</p>
      </div>
      {children}
    </div>
  );
}

interface CollapsibleInfoCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  Icon?: LucideIcon;
}

export function CollapsibleInfoCard({
  title,
  children,
  defaultOpen = false,
  Icon,
}: CollapsibleInfoCardProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="text-xs text-gray-800 dark:text-muted-foreground bg-gray-100/80 dark:bg-sidebar rounded-md"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="text-xs flex items-center justify-between h-auto gap-2 py-3 px-3 w-full font-medium text-foreground font-mono uppercase group/info-card"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon size={12} className="!w-3 !h-3 text-muted-foreground" />}
            {title}
          </div>
          <ChevronDown
            size={12}
            className="w-3 h-3 text-muted-foreground group-data-[state=open]/info-card:rotate-180 transition-transform duration-200"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pt-0 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
