import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function SectionTitle({ title, tooltip }: { title: string; tooltip?: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold flex items-center">
      {title}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-3 h-3 text-muted-foreground ml-1" />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}{' '}
    </h3>
  );
}

function SectionDescription({ description }: { description: string }) {
  return <p className="text-sm text-muted-foreground">{description}</p>;
}

export function SectionHeader({
  title,
  description,
  titleTooltip,
  learnMoreHref,
}: {
  title: string;
  description: string;
  titleTooltip?: React.ReactNode;
  learnMoreHref?: string;
}) {
  return (
    <div className="space-y-1.5">
      <SectionTitle title={title} tooltip={titleTooltip} />
      <SectionDescription description={description} />
      {learnMoreHref && (
        <a
          href={learnMoreHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Learn more
        </a>
      )}
    </div>
  );
}
