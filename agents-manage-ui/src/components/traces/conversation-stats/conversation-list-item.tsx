import Link from 'next/link';
import { formatDateAgo, formatDateTime } from '@/app/utils/format-date';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConversationStats } from '@/lib/api/signoz-stats';

interface ConversationListItemProps {
  conversation: ConversationStats;
  projectId: string;
}

export function ConversationListItem({ conversation, projectId }: ConversationListItemProps) {
  const {
    conversationId,
    firstUserMessage,
    tenantId,
    graphId,
    graphName,
    hasErrors,
    totalErrors,
    toolsUsed,
    startTime,
  } = conversation;

  return (
    <Link
      href={`/${tenantId}/projects/${projectId}/traces/conversations/${conversationId}`}
      className="w-full hover:bg-muted/50 transition-colors py-4 px-6 border-border/50 not-last:border-b"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-foreground">
              {firstUserMessage || 'No user message'}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <code className="font-mono text-gray-500 dark:text-white/50">{conversationId}</code>
              {startTime &&
                (() => {
                  try {
                    const date = new Date(startTime);
                    // Check if the date is valid
                    if (Number.isNaN(date.getTime())) return null;

                    const isoString = date.toISOString();
                    return (
                      <>
                        <span className="text-gray-400 dark:text-white/40">•</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-gray-400 dark:text-white/40 cursor-help">
                              {formatDateAgo(isoString)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Started: {formatDateTime(isoString)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </>
                    );
                  } catch (error) {
                    console.warn(
                      'Invalid startTime for conversation:',
                      conversationId,
                      startTime,
                      error
                    );
                    return null;
                  }
                })()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {toolsUsed.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="primary" className="text-xs">
                    {toolsUsed.length} tool{toolsUsed.length > 1 ? 's' : ''} used
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs font-mono text-muted-foreground">
                    {toolsUsed.map((tool) => tool.name).join(', ')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <Badge variant="code" className="text-xs">
              {graphName ? `${graphName} (${graphId})` : graphId}
            </Badge>
            {hasErrors && (
              <Badge variant="error" className="flex items-center gap-1">
                {totalErrors} Error{totalErrors > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
