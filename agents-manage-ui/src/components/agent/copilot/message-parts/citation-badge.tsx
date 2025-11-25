import type { FC } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const CitationBadge: FC<{
  citation: { key: string; href?: string; artifact: any };
}> = ({ citation }) => {
  const { key, href, artifact } = citation;

  const badge = (
    <span
      className={`citation-badge inline-flex items-center justify-center h-5 min-w-5 px-2 mr-1 text-xs font-medium bg-gray-50 dark:bg-muted text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted/80 rounded-full border border-gray-200 dark:border-border transition-colors ${
        href ? 'cursor-pointer' : 'cursor-help'
      }`}
    >
      {key}
    </span>
  );

  const tooltipContent = (
    <div className="p-2">
      <div className="font-medium text-sm mb-1 text-popover-foreground">{artifact.name}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{artifact.description}</div>
    </div>
  );

  if (href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
            {badge}
          </a>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
};
