import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, Info } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChartError } from './chart-error';

export interface ChartCardProps {
  className?: string;
  title?: string | React.ReactNode;
  titleClassName?: string;
  Icon?: LucideIcon;
  description?: string | React.ReactNode;
  tooltip?: string | React.ReactNode;
  children: React.ReactNode;
  footer?: string | React.ReactNode;
  hasError?: boolean;
  onClick?: () => void;
}

export function ChartCard({
  className,
  title,
  titleClassName,
  Icon,
  description,
  tooltip,
  children,
  footer,
  hasError,
  onClick,
}: ChartCardProps) {
  return (
    <Card
      className={cn(
        'flex flex-col h-full p-6 gap-4 shadow-none border-none bg-sidebar dark:bg-card',
        className
      )}
    >
      <CardHeader className="p-0 pb-2">
        <CardTitle
          className={cn(
            'text-md font-medium text-gray-700 dark:text-white/70 flex items-center justify-between gap-2 flex-wrap',
            titleClassName
          )}
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-gray-400 dark:text-white/40" />}
            {title}
          </div>
          {tooltip && (
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-gray-300 dark:text-white/300" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm text-gray-600 dark:text-white/60">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onClick && (
            <Button
              className="text-primary dark:text-primary hover:text-primary/80 hover:bg-transparent dark:hover:bg-transparent text-xs h-auto"
              variant="ghost"
              size="sm"
              onClick={onClick}
            >
              View Details
              <ArrowUpRight className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {hasError ? (
        <CardContent className="flex-1 p-0 min-h-0">
          <ChartError />
        </CardContent>
      ) : (
        <ErrorBoundary fallback={<ChartError />}>
          <CardContent className="p-0 flex-1 min-h-0 gap-2">{children}</CardContent>
        </ErrorBoundary>
      )}
      {footer && <CardFooter className="p-0">{footer}</CardFooter>}
    </Card>
  );
}
