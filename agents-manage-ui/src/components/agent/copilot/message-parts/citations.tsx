import { BookOpen } from 'lucide-react';
import type { FC } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const Citation = ({ artifact }: { artifact: any }) => {
  const artifactSummary = artifact.artifactSummary || {
    record_type: 'site',
    title: artifact.name,
    url: undefined,
  };
  return (
    <div className="inline-block mr-2 mb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={artifactSummary?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-sm text-xs text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
          >
            <BookOpen className="w-3 h-3 text-gray-500 dark:text-muted-foreground" />
            <span className="max-w-32 truncate">{artifactSummary?.title || artifact.name}</span>
          </a>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="p-2">
            <div className="font-medium text-sm mb-1 text-popover-foreground">{artifact.name}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {artifact.description}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export const Citations: FC<{ artifacts: any[] }> = ({ artifacts }) => {
  return (
    <div className="mt-3 pt-3">
      <div className="text-xs text-gray-500 dark:text-muted-foreground font-medium mb-2">
        Sources
      </div>
      <div className="space-y-2">
        {artifacts.map((artifact, index) => {
          return <Citation key={artifact.artifactId || `artifact-${index}`} artifact={artifact} />;
        })}
      </div>
    </div>
  );
};
