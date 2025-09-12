import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Database,
  Hammer,
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

function truncateWords(s: string, nWords: number) {
  const words = s.split(/\s+/);
  return words.length > nWords ? `${words.slice(0, nWords).join(' ')}...` : s;
}
function truncateChars(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function _isAiMessage(activity: ActivityItem): boolean {
  return (
    activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
    activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
  );
}

function statusIcon(
  type: ActivityKind | 'delegation' | 'transfer' | 'generic_tool' | 'tool_purpose',
  status: ActivityItem['status']
) {
  const base: Record<string, { Icon: any; cls: string }> = {
    user_message: { Icon: User, cls: 'text-primary' },
    ai_generation: { Icon: Sparkles, cls: 'text-primary' },
    ai_assistant_message: { Icon: Sparkles, cls: 'text-primary' },
    ai_model_streamed_text: { Icon: Sparkles, cls: 'text-primary' },
    context_fetch: { Icon: Settings, cls: 'text-indigo-400' },
    context_resolution: { Icon: Database, cls: 'text-indigo-400' },
    tool_call: { Icon: Hammer, cls: 'text-muted-foreground' },
    delegation: { Icon: ArrowRight, cls: 'text-indigo-500' },
    transfer: { Icon: ArrowRight, cls: 'text-indigo-500' },
    generic_tool: { Icon: Hammer, cls: 'text-muted-foreground' },
    tool_purpose: { Icon: Hammer, cls: 'text-muted-foreground' },
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
  isAiMessageCollapsed?: boolean;
  onToggleAiMessageCollapse?: (activityId: string) => void;
}

export function TimelineItem({
  activity,
  isLast,
  onSelect,
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

  return (
    <div className="flex flex-col text-muted-foreground relative text-xs">
      <div className="flex items-start">
        <div className="mr-4 pt-[1px]">
          <Icon className={`w-4 h-4 ${className}`} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelect}
              className="flex items-center gap-1 group cursor-pointer hover:text-primary transition-colors text-foreground duration-200"
              title="Click to view details"
            >
              <span className="font-medium">
                <Streamdown>{activity.description}</Streamdown>
              </span>
              <ArrowUpRight
                className="h-4 w-4 text-muted-foreground group-hover:text-primary"
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
            <Bubble className="break-all">{truncateChars(activity.toolResult, 50)}</Bubble>
          )}

          {/* context resolution summary */}
          {activity.type === 'context_resolution' && activity.status !== 'error' && (
            <div className="mt-2 p-3 rounded-lg max-w-4xl">
              <div className="space-y-2 text-sm">
                {activity.contextConfigId && TagRow('Config', activity.contextConfigId)}
                {activity.contextAgentGraphId && TagRow('Graph', activity.contextAgentGraphId)}
                {activity.contextStatusDescription && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Status:</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        activity.status === 'success'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                      }`}
                    >
                      {activity.contextStatusDescription}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* context resolution URL */}
          {activity.type === 'context_resolution' && activity.contextUrl && (
            <CodeBubble className=" break-all">{truncateChars(activity.contextUrl, 50)}</CodeBubble>
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

          {/* save_tool_result summary */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.toolName === 'save_tool_result' &&
            activity.saveResultSaved && (
              <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 rounded-lg max-w-4xl">
                <div className="flex flex-col gap-2 text-sm text-emerald-900 dark:text-emerald-300">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                      Artifact Saved Successfully
                    </span>
                  </div>

                  {/* Basic artifact info */}
                  <div className="space-y-1">
                    {activity.saveArtifactType &&
                      TagRow('Type', activity.saveArtifactType, 'emerald')}
                    {activity.saveArtifactName && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Name:</span>
                        <span className="text-emerald-900 dark:text-emerald-300">
                          {activity.saveArtifactName}
                        </span>
                      </div>
                    )}
                    {activity.saveArtifactDescription && (
                      <div className="flex items-start gap-2">
                        <span className="font-medium">Description:</span>
                        <span className="text-emerald-900 dark:text-emerald-300">
                          {activity.saveArtifactDescription}
                        </span>
                      </div>
                    )}
                    {activity.saveTotalArtifacts && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Total Artifacts:</span>
                        <span className="text-emerald-900 dark:text-emerald-300">
                          {activity.saveTotalArtifacts}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Technical details */}
                  {(activity.saveOperationId ||
                    activity.saveToolCallId ||
                    activity.saveFunctionId) && (
                    <div className="mt-2 p-2 bg-white/50 border border-emerald-200 rounded text-xs dark:bg-emerald-950/30 dark:border-emerald-800">
                      <div className="font-medium text-emerald-800 mb-1 dark:text-emerald-400">
                        Technical Details:
                      </div>
                      <div className="space-y-0.5 text-emerald-700 dark:text-emerald-300">
                        {activity.saveOperationId && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Operation ID:</span>
                            <code className="bg-emerald-100 px-1 rounded dark:bg-emerald-900/50 dark:text-emerald-200">
                              {activity.saveOperationId}
                            </code>
                          </div>
                        )}
                        {activity.saveToolCallId && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Tool Call ID:</span>
                            <code className="bg-emerald-100 px-1 rounded dark:bg-emerald-900/50 dark:text-emerald-200">
                              {activity.saveToolCallId}
                            </code>
                          </div>
                        )}
                        {activity.saveFunctionId && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Function ID:</span>
                            <code className="bg-emerald-100 px-1 rounded dark:bg-emerald-900/50 dark:text-emerald-200">
                              {activity.saveFunctionId}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Summary data */}
                  {activity.saveSummaryData && (
                    <div className="mt-2 p-2 bg-white/70 border border-emerald-200 rounded text-xs dark:bg-emerald-950/30 dark:border-emerald-800">
                      <div className="font-medium text-emerald-800 mb-1 dark:text-emerald-400">
                        Summary Data:
                      </div>
                      <div className="space-y-0.5 text-emerald-900 dark:text-emerald-300">
                        {Object.entries(activity.saveSummaryData).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2">
                            <span className="font-medium capitalize">{k}:</span>
                            <span className="break-all">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tool arguments */}
                  {activity.saveToolArgs && Object.keys(activity.saveToolArgs).length > 0 && (
                    <div className="mt-2 p-2 bg-white/70 border border-emerald-200 rounded text-xs">
                      <div className="font-medium text-emerald-800 mb-1">Tool Arguments:</div>
                      <div className="space-y-0.5 text-emerald-900">
                        {Object.entries(activity.saveToolArgs).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2">
                            <span className="font-medium">{k}:</span>
                            <span className="break-all">
                              {typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Facts if available */}
                  {activity.saveFacts && (
                    <div className="mt-2 p-2 bg-white/70 border border-emerald-200 rounded text-xs dark:bg-emerald-950/30 dark:border-emerald-800">
                      <div className="font-medium text-emerald-800 mb-1 dark:text-emerald-400">
                        Facts:
                      </div>
                      <div className="text-emerald-900 break-all dark:text-emerald-300">
                        {activity.saveFacts}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* save_tool_result not saved */}
          {activity.type === ACTIVITY_TYPES.TOOL_CALL &&
            activity.toolName === 'save_tool_result' &&
            activity.saveResultSaved === false && (
              <CodeBubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                Artifact not saved
              </CodeBubble>
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

      {!isLast && <div className="absolute top-6 left-[7px] border-l border-border h-full" />}
    </div>
  );
}
