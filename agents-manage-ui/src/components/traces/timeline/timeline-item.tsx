import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Hammer,
  Library,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { formatDateTime } from '@/app/utils/format-date';
import { JsonEditorWithCopy } from '@/components/editors/json-editor-with-copy';
import { Bubble } from '@/components/traces/timeline/bubble';
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

function formatJsonSafely(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
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
    ai_model_streamed_object: { Icon: Sparkles, cls: 'text-primary' },
    context_fetch: { Icon: Settings, cls: 'text-indigo-400' },
    context_resolution: { Icon: Database, cls: 'text-indigo-400' },
    tool_call: { Icon: Hammer, cls: 'text-muted-foreground' },
    delegation: { Icon: ArrowRight, cls: 'text-indigo-500' },
    transfer: { Icon: ArrowRight, cls: 'text-indigo-500' },
    generic_tool: { Icon: Hammer, cls: 'text-muted-foreground' },
    tool_purpose: { Icon: Hammer, cls: 'text-muted-foreground' },
    artifact_processing: { Icon: Library, cls: 'text-emerald-600' },
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
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TimelineItem({
  activity,
  isLast,
  onSelect,
  isSelected = false,
  isAiMessageCollapsed = false,
  onToggleAiMessageCollapse,
  hasChildren = false,
  isCollapsed = false,
  onToggleCollapse,
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
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onSelect}
              className={`flex items-center gap-1 group cursor-pointer transition-colors duration-200 ${textColorClass}`}
              title="Click to view details"
            >
              <span className="font-medium">
                <Streamdown>{activity.description}</Streamdown>
              </span>
            </button>
            {hasChildren && onToggleCollapse && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse();
                }}
                className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-muted transition-colors"
                title={isCollapsed ? 'Expand children' : 'Collapse children'}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            )}
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

          {/* subagent badge for AI assistant message */}
          {activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code">{activity.subAgentId}</Badge>
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
                    isAiMessageCollapsed ? 'Expand AI streaming text' : 'Collapse AI streaming text'
                  }
                >
                  {isAiMessageCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  AI Streaming Text
                </button>
              )}
              {!isAiMessageCollapsed && (
                <Bubble>{truncateWords(activity.aiStreamTextContent, 100)}</Bubble>
              )}
            </div>
          )}

          {/* ai.telemetry.functionId badge for streamed text */}
          {activity.type === 'ai_model_streamed_text' && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code" className="text-xs">
                {activity.subAgentId}
              </Badge>
            </div>
          )}

          {/* streamed object bubble */}
          {activity.type === 'ai_model_streamed_object' && activity.aiStreamObjectContent && (
            <div className="space-y-2">
              {onToggleAiMessageCollapse && (
                <button
                  type="button"
                  onClick={() => onToggleAiMessageCollapse(activity.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={
                    isAiMessageCollapsed
                      ? 'Expand AI streaming object'
                      : 'Collapse AI streaming object'
                  }
                >
                  {isAiMessageCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  AI Streaming Object
                </button>
              )}
              {!isAiMessageCollapsed && (
                <div className="mt-2">
                  <JsonEditorWithCopy
                    value={formatJsonSafely(activity.aiStreamObjectContent)}
                    title="Structured object response"
                    uri={`stream-object-${activity.id}.json`}
                  />
                </div>
              )}
            </div>
          )}

          {/* ai.telemetry.functionId badge for streamed object */}
          {activity.type === 'ai_model_streamed_object' && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code" className="text-xs">
                {activity.subAgentId}
              </Badge>
            </div>
          )}

          {/* context fetch url */}
          {activity.type === 'context_fetch' && activity.toolResult && (
            <div className="mb-1">
              <Badge variant="code" className="break-all">
                {activity.toolResult}
              </Badge>
            </div>
          )}

          {/* context resolution URL */}
          {activity.type === 'context_resolution' && activity.contextUrl && (
            <div className="mb-1">
              <Badge variant="code" className="break-all">
                {activity.contextUrl}
              </Badge>
            </div>
          )}

          {/* delegation flow */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.toolName?.includes('delegate') && (
              <Flow
                from={activity.delegationFromSubAgentId || 'Unknown sub agent'}
                to={activity.delegationToSubAgentId || 'Unknown sub agent'}
              />
            )}

          {/* transfer flow */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            (activity.toolType === TOOL_TYPES.TRANSFER ||
              activity.toolName?.includes('transfer')) && (
              <Flow
                from={activity.transferFromSubAgentId || 'Unknown sub agent'}
                to={activity.transferToSubAgentId || 'Unknown sub agent'}
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
                    <div className="mt-2">
                      <JsonEditorWithCopy
                        value={formatJsonSafely(activity.artifactData)}
                        title="Artifact data"
                        uri={`artifact-data-${activity.id}.json`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* agent name for AI generation */}
          {activity.type === ACTIVITY_TYPES.AI_GENERATION && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code">{activity.subAgentId}</Badge>
            </div>
          )}

          {/* agent ID for agent generation */}
          {activity.type === ACTIVITY_TYPES.AGENT_GENERATION && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code">{activity.subAgentId}</Badge>
            </div>
          )}

          {/* ai.telemetry.functionId badge for ai.toolCall spans that aren't delegate or transfers */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.subAgentId &&
            activity.toolType !== 'delegation' &&
            activity.toolType !== 'transfer' && (
              <div className="mb-1">
                <Badge variant="code" className="text-xs">
                  {activity.subAgentId}
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
