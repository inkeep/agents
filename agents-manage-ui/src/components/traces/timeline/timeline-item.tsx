import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Hammer,
  Hash,
  Library,
  Settings,
  Sparkles,
  Timer,
  User,
  X,
  Zap,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { JsonEditorWithCopy } from '@/components/editors/json-editor-with-copy';
import { Bubble } from '@/components/traces/timeline/bubble';
import { Flow } from '@/components/traces/timeline/flow';
import { TagRow } from '@/components/traces/timeline/tag-row';
import {
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
  type ActivityItem,
  type ActivityKind,
  TOOL_TYPES,
} from '@/components/traces/timeline/types';
import { Badge } from '@/components/ui/badge';
import { SLACK_BRAND_COLOR } from '@/constants/theme';
import { formatDateTime } from '@/lib/utils/format-date';

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

interface MessagePart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
  metadata?: {
    source?: string;
    triggerId?: string;
    [key: string]: any;
  };
}

function MessagePartsDisplay({
  messageParts,
  messageContent,
  activityId,
}: {
  messageParts?: string;
  messageContent?: string;
  activityId: string;
}) {
  // Try to parse messageParts JSON
  let parts: MessagePart[] | null = null;
  if (messageParts) {
    try {
      parts = JSON.parse(messageParts);
    } catch {
      // If parsing fails, fall back to messageContent
      parts = null;
    }
  }

  // If no valid parts, fall back to simple message content
  if (!parts || !Array.isArray(parts) || parts.length === 0) {
    return messageContent ? (
      <Bubble>
        <div className="line-clamp-2">{messageContent}</div>
      </Bubble>
    ) : null;
  }

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.kind === 'text' && part.text) {
          return (
            <Bubble key={`${activityId}-part-${index}`}>
              <div className="line-clamp-2">{part.text}</div>
            </Bubble>
          );
        }

        if (part.kind === 'data' && part.data != null) {
          const source = part.metadata?.source;
          return (
            <div key={`${activityId}-part-${index}`} className="mt-2 overflow-hidden max-w-full">
              <div className="text-xs text-muted-foreground mb-1">
                Structured Data{source ? ` (${source})` : ''}
              </div>
              <div className="overflow-x-auto">
                <JsonEditorWithCopy
                  value={JSON.stringify(part.data, null, 2)}
                  title=""
                  uri={`message-data-${activityId}-${index}.json`}
                />
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function statusIcon(
  type:
    | ActivityKind
    | 'delegation'
    | 'transfer'
    | 'generic_tool'
    | 'tool_purpose'
    | 'tool_approval_requested'
    | 'tool_approval_approved'
    | 'tool_approval_denied'
    | 'trigger_invocation'
    | 'slack_message'
    | 'max_steps_reached'
    | 'stream_lifetime_exceeded',
  status: ActivityItem['status']
) {
  const base: Record<string, { Icon: any; cls: string; style?: React.CSSProperties }> = {
    trigger_invocation: { Icon: Zap, cls: 'text-amber-500' },
    slack_message: { Icon: Hash, cls: '', style: { color: SLACK_BRAND_COLOR } },
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
    artifact_processing: { Icon: Library, cls: 'text-emerald-600' },
    tool_approval_requested: { Icon: Clock, cls: 'text-muted-foreground' },
    tool_approval_approved: { Icon: Check, cls: 'text-blue-500' },
    tool_approval_denied: { Icon: X, cls: 'text-red-500' },
    compression: { Icon: Archive, cls: 'text-orange-500' },
    max_steps_reached: { Icon: AlertTriangle, cls: 'text-yellow-500' },
    stream_lifetime_exceeded: { Icon: Timer, cls: 'text-red-500' },
  };

  const map = base[type] || base.tool_call;
  const cls =
    status === ACTIVITY_STATUS.SUCCESS
      ? map.cls
      : status === ACTIVITY_STATUS.ERROR
        ? 'text-red-500'
        : status === ACTIVITY_STATUS.WARNING
          ? 'text-yellow-500'
          : status === ACTIVITY_STATUS.PENDING
            ? 'text-yellow-500'
            : map.cls;

  return { Icon: map.Icon, className: cls, style: map.style };
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
    // Trigger invocations get their own icon (Zap)
    activity.type === ACTIVITY_TYPES.USER_MESSAGE && activity.invocationType === 'trigger'
      ? 'trigger_invocation'
      : // Slack messages get their own icon (Hash)
        activity.type === ACTIVITY_TYPES.USER_MESSAGE && activity.invocationType === 'slack'
        ? 'slack_message'
        : activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolType === TOOL_TYPES.TRANSFER
          ? 'transfer'
          : activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolName?.includes('delegate')
            ? 'delegation'
            : activity.type === ACTIVITY_TYPES.TOOL_CALL && activity.toolPurpose
              ? 'tool_purpose'
              : activity.type === ACTIVITY_TYPES.TOOL_CALL
                ? 'generic_tool'
                : activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_REQUESTED
                  ? 'tool_approval_requested'
                  : activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_APPROVED
                    ? 'tool_approval_approved'
                    : activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_DENIED
                      ? 'tool_approval_denied'
                      : activity.type;

  const { Icon, className, style: iconStyle } = statusIcon(typeForIcon as any, activity.status);
  const formattedDateTime = formatDateTime(activity.timestamp, { local: true });
  const isoDateTime = new Date(activity.timestamp).toISOString();

  // Determine text color based on status
  const textColorClass =
    activity.status === ACTIVITY_STATUS.ERROR
      ? 'text-red-500 hover:text-red-700'
      : activity.status === ACTIVITY_STATUS.WARNING
        ? 'text-yellow-500 hover:text-yellow-700'
        : 'text-foreground hover:text-primary';

  return (
    <div
      className={`flex flex-col text-muted-foreground relative text-xs`}
      data-has-error={activity.status === ACTIVITY_STATUS.ERROR || undefined}
    >
      <div className="flex items-start">
        <div className="mr-2 py-2" style={{ width: '16px' }}>
          <div className="absolute left-[7px] top-[8px] -translate-x-1/2 flex items-center justify-center w-5 h-5 rounded bg-white dark:bg-background z-10">
            <Icon className={`w-4 h-4 ${className}`} style={iconStyle} />
          </div>
        </div>

        <div
          className={`space-y-1.5 px-3 py-2 w-full min-w-0 transition-all duration-200 rounded-lg ${
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
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            )}
          </div>

          {/* user message bubble - render parts if available, otherwise fall back to messageContent */}
          {activity.type === ACTIVITY_TYPES.USER_MESSAGE &&
            (activity.messageParts || activity.messageContent) && (
              <MessagePartsDisplay
                messageParts={activity.messageParts}
                messageContent={activity.messageContent}
                activityId={activity.id}
              />
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
              <Badge variant="code">
                {activity.subAgentName
                  ? `${activity.subAgentName} (${activity.subAgentId})`
                  : activity.subAgentId}
              </Badge>
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
                  {activity.aiTelemetryPhase === 'structured_generation'
                    ? 'Structured Output'
                    : 'AI Streaming Text'}
                </button>
              )}
              {!isAiMessageCollapsed &&
                (activity.aiTelemetryPhase === 'structured_generation' ? (
                  <div className="mt-2">
                    <JsonEditorWithCopy
                      value={formatJsonSafely(activity.aiStreamTextContent)}
                      title=""
                      uri={`structured-output-${activity.id}.json`}
                    />
                  </div>
                ) : (
                  <Bubble>{truncateWords(activity.aiStreamTextContent, 100)}</Bubble>
                ))}
            </div>
          )}

          {/* ai.telemetry.functionId badge for streamed text */}
          {activity.type === 'ai_model_streamed_text' && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code" className="text-xs">
                {activity.subAgentName
                  ? `${activity.subAgentName} (${activity.subAgentId})`
                  : activity.subAgentId}
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

          {/* MCP server badge for MCP tool calls */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.toolType === TOOL_TYPES.MCP &&
            activity.mcpServerName && (
              <div className="mb-1">
                <Badge variant="code" className="text-xs">
                  MCP: {activity.mcpServerName}
                </Badge>
              </div>
            )}

          {/* artifact processing */}
          {activity.type === ACTIVITY_TYPES.ARTIFACT_PROCESSING && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 rounded-lg max-w-4xl">
              <div className="flex flex-col gap-2 text-sm text-emerald-900 dark:text-emerald-300">
                {/* Oversized artifact warning */}
                {activity.artifactIsOversized && (
                  <div className="flex items-center gap-2 p-2 bg-amber-100 border border-amber-300 dark:bg-amber-900/30 dark:border-amber-700 rounded text-amber-900 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 text-xs font-medium">
                      Oversized artifact
                      {activity.artifactOriginalTokenSize && (
                        <span className="ml-1 font-normal">
                          (~{Math.floor(activity.artifactOriginalTokenSize / 1000)}K tokens)
                        </span>
                      )}
                    </div>
                  </div>
                )}
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
              <Badge variant="code">
                {activity.subAgentName
                  ? `${activity.subAgentName} (${activity.subAgentId})`
                  : activity.subAgentId}
              </Badge>
            </div>
          )}

          {/* agent ID for agent generation */}
          {activity.type === ACTIVITY_TYPES.AGENT_GENERATION && activity.subAgentId && (
            <div className="mb-1">
              <Badge variant="code">
                {activity.subAgentName
                  ? `${activity.subAgentName} (${activity.subAgentId})`
                  : activity.subAgentId}
              </Badge>
            </div>
          )}

          {/* ai.telemetry.functionId badge for ai.toolCall spans that aren't delegate or transfers */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.subAgentId &&
            activity.toolType !== 'delegation' &&
            activity.toolType !== 'transfer' && (
              <div className="mb-1">
                <Badge variant="code" className="text-xs">
                  {activity.subAgentName
                    ? `${activity.subAgentName} (${activity.subAgentId})`
                    : activity.subAgentId}
                </Badge>
              </div>
            )}

          {/* Sub-agent badge for tool approval activities */}
          {(activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_REQUESTED ||
            activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_APPROVED ||
            activity.type === ACTIVITY_TYPES.TOOL_APPROVAL_DENIED) &&
            activity.subAgentId && (
              <div className="mb-1">
                <Badge variant="code" className="text-xs">
                  {activity.subAgentName
                    ? `${activity.subAgentName} (${activity.subAgentId})`
                    : activity.subAgentId}
                </Badge>
              </div>
            )}

          {/* Max steps reached display */}
          {activity.type === ACTIVITY_TYPES.MAX_STEPS_REACHED &&
            activity.stepsCompleted !== undefined &&
            activity.maxSteps !== undefined && (
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-lg max-w-4xl">
                <div className="text-sm text-yellow-900 dark:text-yellow-300">
                  <span className="font-medium">Steps:</span> {activity.stepsCompleted} /{' '}
                  {activity.maxSteps}
                </div>
              </div>
            )}

          {/* Stream lifetime exceeded display */}
          {activity.type === ACTIVITY_TYPES.STREAM_LIFETIME_EXCEEDED &&
            activity.streamMaxLifetimeMs !== undefined && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-lg max-w-4xl">
                <div className="text-sm text-red-900 dark:text-red-300">
                  <span className="font-medium">Lifetime limit:</span>{' '}
                  {Math.round(activity.streamMaxLifetimeMs / 1000)}s
                </div>
              </div>
            )}

          {/* Status message display for errors and warnings */}
          {(activity.otelStatusDescription || activity.toolStatusMessage) &&
            (activity.status === ACTIVITY_STATUS.ERROR ||
              activity.status === ACTIVITY_STATUS.WARNING) && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onToggleAiMessageCollapse?.(activity.id)}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    activity.status === ACTIVITY_STATUS.ERROR
                      ? 'text-red-500 hover:text-red-600'
                      : 'text-yellow-500 hover:text-yellow-600'
                  }`}
                  title={
                    isAiMessageCollapsed
                      ? `Expand ${activity.status} message`
                      : `Collapse ${activity.status} message`
                  }
                >
                  {isAiMessageCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {activity.status === ACTIVITY_STATUS.ERROR ? 'Error Details' : 'Warning Details'}
                </button>
                {!isAiMessageCollapsed && (
                  <Bubble
                    className={
                      activity.status === ACTIVITY_STATUS.ERROR
                        ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300'
                    }
                  >
                    {activity.otelStatusDescription || activity.toolStatusMessage}
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

      {!isLast && !isCollapsed && hasChildren && (
        <div
          className="absolute top-4 left-[7px] border-l border-border"
          style={{ height: 'calc(100%)' }}
        />
      )}
    </div>
  );
}
