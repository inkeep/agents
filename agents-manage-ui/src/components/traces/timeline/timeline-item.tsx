import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Hammer,
  Package,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { formatDateTime } from '@/app/utils/format-date';
import { Bubble, CodeBubble } from '@/components/traces/timeline/bubble';
import { Flow } from '@/components/traces/timeline/flow';
import { TagRow } from '@/components/traces/timeline/tag-row';
import {
  ACTIVITY_TYPES,
  type ActivityItem,
  type ActivityKind,
  TOOL_TYPES,
} from '@/components/traces/timeline/types';
import { Badge } from '@/components/ui/badge';

function truncateWords(s: string, nWords: number) {
  const words = s.split(/\s+/);
  return words.length > nWords ? `${words.slice(0, nWords).join(' ')}...` : s;
}

function statusIcon(
  type: ActivityKind | 'delegation' | 'transfer' | 'generic_tool' | 'tool_purpose',
  status: ActivityItem['status']
) {
  const base: Record<string, { Icon: any; cls: string }> = {
    user_message: { Icon: User, cls: 'text-primary' },
    ai_generation: { Icon: Sparkles, cls: 'text-primary' },
    agent_generation: { Icon: Cpu, cls: 'text-purple-500' },
    ai_assistant_message: { Icon: Sparkles, cls: 'text-primary' },
    ai_model_streamed_text: { Icon: Sparkles, cls: 'text-primary' },
    context_fetch: { Icon: Settings, cls: 'text-indigo-400' },
    context_resolution: { Icon: Database, cls: 'text-indigo-400' },
    tool_call: { Icon: Hammer, cls: 'text-muted-foreground' },
    delegation: { Icon: ArrowRight, cls: 'text-indigo-500' },
    transfer: { Icon: ArrowRight, cls: 'text-indigo-500' },
    generic_tool: { Icon: Hammer, cls: 'text-muted-foreground' },
    tool_purpose: { Icon: Hammer, cls: 'text-muted-foreground' },
    artifact_processing: { Icon: Package, cls: 'text-emerald-600' },
  };

  const map = base[type] || base.tool_call;
  const cls =
    status === 'success'
      ? map.cls
      : status === 'error'
        ? 'text-red-500'
        : status === 'pending'
          ? 'text-yellow-500'
          : map.cls;

  return { Icon: map.Icon, className: cls };
}

interface TimelineItemProps {
  activity: ActivityItem;
  isLast: boolean;
  onSelect: () => void;
  isSelected?: boolean;
  isAiMessageCollapsed?: boolean;
  onToggleAiMessageCollapse?: (activityId: string) => void;
}

export function TimelineItem({
  activity,
  isLast,
  onSelect,
  isSelected = false,
  isAiMessageCollapsed = false,
  onToggleAiMessageCollapse,
}: TimelineItemProps) {
  const typeForIcon =
    activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolType === TOOL_TYPES.TRANSFER
      ? 'transfer'
      : activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolName?.includes('delegate')
        ? 'delegation'
        : activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolPurpose
          ? 'tool_purpose'
          : activity.type === ACTIVITY_TYPES.TOOL_CALL
            ? 'generic_tool'
            : activity.type;

  const { Icon, className } = statusIcon(typeForIcon as any, activity.status);
  const formattedDateTime = formatDateTime(activity.timestamp);
  const isoDateTime = new Date(activity.timestamp).toISOString();

  // Determine text color based on status
  const textColorClass =
    activity.status === 'error'
      ? 'text-red-500 hover:text-red-700'
      : 'text-foreground hover:text-primary';

  return (
    <div className={`flex flex-col text-muted-foreground relative text-xs`}>
      <div className="flex items-start">
        <div className="mr-2 py-2">
          <Icon className={`w-4 h-4 ${className}`} />
        </div>

        <div
          className={`space-y-1.5 px-3 py-2 w-full transition-all duration-200 rounded-lg ${
            isSelected ? 'ring-1 ring-primary/50 bg-primary/5' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelect}
              className={`flex items-center gap-1 group cursor-pointer transition-colors duration-200 ${textColorClass}`}
              title="Click to view details"
            >
              <span className="font-medium">
                <Streamdown>{activity.description}</Streamdown>
              </span>
              <ArrowUpRight
                className={`h-4 w-4 transition-colors ${activity.status === 'error' ? 'text-red-700 group-hover:text-red-800' : 'text-muted-foreground group-hover:text-primary'}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* user message bubble */}
          {activity.type === ACTIVITY_TYPES.USER_MESSAGE && activity.messageContent && (
            <Bubble>
              <div className="line-clamp-2"> {activity.messageContent}</div>
              {/* {truncateWords(activity.messageContent, 100)} */}
              {/* {activity.messageContent} */}
            </Bubble>
          )}

          {/* assistant message bubble */}
          {activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE && activity.aiResponseContent && (
            <div className="space-y-2">
              {onToggleAiMessageCollapse && (
                <button
                  type="button"
                  onClick={() => onToggleAiMessageCollapse(activity.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={isAiMessageCollapsed ? 'Expand AI response' : 'Collapse AI response'}
                >
                  {isAiMessageCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  AI Assistant Response
                </button>
              )}
              {!isAiMessageCollapsed && (
                <Bubble>
                  <Streamdown>{activity.aiResponseContent}</Streamdown>
                </Bubble>
              )}
            </div>
          )}

          {/* streamed text bubble */}
          {activity.type === 'ai_model_streamed_text' && activity.aiStreamTextContent && (
            <div className="space-y-2">
              {onToggleAiMessageCollapse && (
                <button
                  type="button"
                  onClick={() => onToggleAiMessageCollapse(activity.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={
                    isAiMessageCollapsed
                      ? 'Expand AI streaming response'
                      : 'Collapse AI streaming response'
                  }
                >
                  {isAiMessageCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  AI Streaming Response
                </button>
              )}
              {!isAiMessageCollapsed && (
                <Bubble>{truncateWords(activity.aiStreamTextContent, 100)}</Bubble>
              )}
            </div>
          )}

          {/* context fetch url */}
          {activity.type === 'context_fetch' && activity.toolResult && (
            <div className="mb-1">
              <Badge variant="code" className="break-all">{activity.toolResult}</Badge>
            </div>
          )}

          {/* context resolution URL */}
          {activity.type === 'context_resolution' && activity.contextUrl && (
            <div className="mb-1">
              <Badge variant="code" className="break-all">{activity.contextUrl}</Badge>
            </div>
          )}

          {/* delegation flow */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.toolName?.includes('delegate') && (
              <Flow
                from={activity.delegationFromAgentId || activity.agentName || 'Unknown Agent'}
                to={
                  activity.delegationToAgentId ||
                  activity.toolName?.replace('delegate_to_', '') ||
                  'Target'
                }
              />
            )}

          {/* transfer flow */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            (activity.toolType === TOOL_TYPES.TRANSFER ||
              activity.toolName?.includes('transfer')) && (
              <Flow
                from={activity.transferFromAgentId || activity.agentName || 'Unknown Agent'}
                to={
                  activity.transferToAgentId ||
                  activity.toolName?.replace('transfer_to_', '') ||
                  'Target'
                }
              />
            )}

          {/* tool purpose bubble */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            (activity.toolType === TOOL_TYPES.MCP || activity.toolType === TOOL_TYPES.TOOL) &&
            activity.toolPurpose && (
              <Bubble className="line-clamp-2">{activity.toolPurpose}</Bubble>
            )}

          {/* artifact processing */}
          {activity.type === ACTIVITY_TYPES.ARTIFACT_PROCESSING && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 rounded-lg max-w-4xl">
              <div className="flex flex-col gap-2 text-sm text-emerald-900 dark:text-emerald-300">

                {/* Basic artifact info */}
                <div className="space-y-1">
                  {activity.artifactType && TagRow('Type', activity.artifactType, 'emerald')}
                  {activity.artifactName && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Name:</span>
                      <span className="text-emerald-900 dark:text-emerald-300">
                        {activity.artifactName}
                      </span>
                    </div>
                  )}
                  {activity.artifactDescription && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium">Description:</span>
                      <span className="text-emerald-900 dark:text-emerald-300">
                        {activity.artifactDescription}
                      </span>
                    </div>
                  )}
                  {activity.artifactData && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Data:</span>
                      <div className="text-emerald-900 dark:text-emerald-300 whitespace-pre-wrap break-words">
                        {(() => {
                          try {
                            const parsed = JSON.parse(activity.artifactData);
                            // Check if this is a baseSelector wrapper and extract the inner content
                            if (parsed?.baseSelector?.type === 'text' && parsed.baseSelector.text !== undefined) {
                              const innerContent = parsed.baseSelector.text;
                              // If it's a string, render directly with newlines preserved
                              if (typeof innerContent === 'string') {
                                return innerContent;
                              }
                              // If it's an object, render as readable text (key: value pairs)
                              return Object.entries(innerContent)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join('\n');
                            }
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            // If parsing fails, show raw data
                            return activity.artifactData;
                          }
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* agent name for AI generation */}
          {activity.type === ACTIVITY_TYPES.AI_GENERATION && activity.agentName && (
            <div className="mb-1">
              <Badge variant="code">{activity.agentName}</Badge>
            </div>
          )}

          {/* ai.telemetry.functionId badge for ai.toolCall spans that aren't delegate or transfers */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.aiTelemetryFunctionId &&
            activity.toolType !== 'delegation' &&
            activity.toolType !== 'transfer' && (
              <div className="mb-1">
                <Badge variant="code" className="text-xs">
                  {activity.aiTelemetryFunctionId}
                </Badge>
              </div>
            )}

          {/* Error display for failed AI/Agent generations */}
          {activity.hasError && activity.otelStatusDescription && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onToggleAiMessageCollapse?.(activity.id)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                title={isAiMessageCollapsed ? 'Expand error message' : 'Collapse error message'}
              >
                {isAiMessageCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Error Details
              </button>
              {!isAiMessageCollapsed && (
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {activity.otelStatusDescription}
                </Bubble>
              )}
            </div>
          )}

          <time
            className="text-xs mb-2 inline-block text-gray-500 dark:text-white/50"
            dateTime={isoDateTime}
            title={formattedDateTime}
          >
            {formattedDateTime}
          </time>
        </div>
      </div>

      {!isLast && <div className="absolute top-8 left-[7px] border-l border-border h-full" />}
    </div>
  );
}
