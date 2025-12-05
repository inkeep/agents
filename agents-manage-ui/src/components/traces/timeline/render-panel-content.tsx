import { useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import { formatDateTime } from '@/app/utils/format-date';
import { JsonEditorWithCopy } from '@/components/editors/json-editor-with-copy';
import { SignozSpanLink } from '@/components/traces/signoz-link';
import {
  Divider,
  Info,
  LabeledBlock,
  ModelBadge,
  Section,
  StatusBadge,
} from '@/components/traces/timeline/blocks';
import { Bubble, CodeBubble } from '@/components/traces/timeline/bubble';
import { SpanAttributes } from '@/components/traces/timeline/span-attributes';
import type {
  ContextBreakdown,
  ConversationDetail,
  SelectedPanel,
} from '@/components/traces/timeline/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatJsonSafely(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

/** Compact context breakdown for the side panel */
function ContextBreakdownPanel({ breakdown }: { breakdown: ContextBreakdown }) {
  const items = useMemo(() => {
    const config: Array<{
      key: keyof Omit<ContextBreakdown, 'total'>;
      label: string;
      color: string;
    }> = [
      { key: 'toolsSection', label: 'Tools (MCP/Function/Relation)', color: 'bg-emerald-500' },
      { key: 'coreInstructions', label: 'Core Instructions', color: 'bg-indigo-500' },
      { key: 'systemPromptTemplate', label: 'System Prompt Template', color: 'bg-blue-500' },
      { key: 'transferInstructions', label: 'Transfer Instructions', color: 'bg-cyan-500' },
      { key: 'agentPrompt', label: 'Agent Prompt', color: 'bg-violet-500' },
      { key: 'artifactsSection', label: 'Artifacts', color: 'bg-amber-500' },
      { key: 'dataComponents', label: 'Data Components', color: 'bg-orange-500' },
      { key: 'artifactComponents', label: 'Artifact Components', color: 'bg-rose-500' },
      { key: 'delegationInstructions', label: 'Delegation Instructions', color: 'bg-teal-500' },
      { key: 'thinkingPreparation', label: 'Thinking Preparation', color: 'bg-purple-500' },
      { key: 'conversationHistory', label: 'Conversation History', color: 'bg-sky-500' },
    ];

    return config
      .map((c) => ({ ...c, value: breakdown[c.key] }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [breakdown]);

  if (breakdown.total === 0) return null;

  return (
    <LabeledBlock label="Context token breakdown">
      <div className="space-y-3">
        {/* Total */}
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-foreground">
            ~{breakdown.total.toLocaleString()} tokens
          </span>
          <span className="text-xs text-muted-foreground">estimated</span>
        </div>

        {/* Stacked bar */}
        <div className="h-3 rounded-full overflow-hidden flex bg-muted">
          {items.map((item) => {
            const percentage = (item.value / breakdown.total) * 100;
            if (percentage < 0.5) return null;
            return (
              <div
                key={item.key}
                className={`${item.color}`}
                style={{ width: `${percentage}%` }}
                title={`${item.label}: ${item.value.toLocaleString()} tokens (${percentage.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="space-y-1.5">
          {items.map((item) => {
            const percentage = (item.value / breakdown.total) * 100;
            return (
              <div key={item.key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
                  <span className="text-muted-foreground">{item.label}</span>
                </div>
                <span className="font-mono text-foreground">
                  {item.value.toLocaleString()} ({percentage.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
          Estimated using ~4 characters per token
        </p>
      </div>
    </LabeledBlock>
  );
}

function AssistantMessageContent({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <LabeledBlock label="AI response content">
      <div className="relative">
        <Bubble className={`break-words ${isExpanded ? '' : 'max-h-48 overflow-hidden'}`}>
          <Streamdown>{content}</Streamdown>
        </Bubble>
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 w-full text-xs"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </Button>
    </LabeledBlock>
  );
}

export function renderPanelContent({
  selected,
  findSpanById,
}: {
  selected: SelectedPanel;
  findSpanById: (
    id?: string
  ) => NonNullable<ConversationDetail['allSpanAttributes']>[number] | undefined;
}) {
  if (selected.type === 'mcp_tool_error') {
    const e = selected.item;
    return (
      <Section>
        <Info label="Tool name" value={<Badge variant="code">{e.toolName}</Badge>} />
        <LabeledBlock label="Error message">
          <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {e.error}
          </Bubble>
        </LabeledBlock>
        <LabeledBlock label="Failure reason">
          <Bubble className="bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300">
            {e.failureReason}
          </Bubble>
        </LabeledBlock>
        <Info label="Span ID" value={<Badge variant="code">{e.spanId}</Badge>} />
        <Info label="Timestamp" value={formatDateTime(e.timestamp)} />
      </Section>
    );
  }

  const a = selected.item;

  const span = findSpanById(a.id);

  const SignozButton = span ? (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-sm font-semibold text-foreground">Advanced</h4>
      <SignozSpanLink traceId={span.traceId} spanId={span.spanId} />
    </div>
  ) : null;

  const AdvancedBlock = span ? (
    <SpanAttributes span={span.data} />
  ) : (
    <div className="text-center py-4 text-xs text-muted-foreground">Span not found.</div>
  );

  switch (selected.type) {
    case 'ai_generation':
      return (
        <>
          <Section>
            <Info label="Model" value={<ModelBadge model={a.aiModel || 'Unknown'} />} />
            <Info label="Input tokens" value={a.inputTokens?.toLocaleString() || '0'} />
            <Info label="Output tokens" value={a.outputTokens?.toLocaleString() || '0'} />
            <Info label="Sub agent" value={a.subAgentName || '-'} />
            {a.aiResponseText && (
              <LabeledBlock label="Response text">
                <Bubble className="whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {a.aiResponseText}
                </Bubble>
              </LabeledBlock>
            )}
            {a.aiPromptMessages && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.aiPromptMessages)}
                title="Prompt messages"
                uri="prompt-messages.json"
              />
            )}
            {a.aiResponseToolCalls && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.aiResponseToolCalls)}
                title="Tool calls"
                uri="tool-calls.json"
              />
            )}
            {/* Show error message if there's an error */}
            {a.hasError && a.otelStatusDescription && (
              <LabeledBlock label="Error">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.otelStatusDescription}
                </Bubble>
              </LabeledBlock>
            )}
            {a.hasError && a.otelStatusCode && (
              <Info label="Status code" value={a.otelStatusCode} />
            )}
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'agent_generation':
      return (
        <>
          <Section>
            <Info
              label="Sub agent"
              value={a.subAgentId ? <Badge variant="code">{a.subAgentId}</Badge> : 'Unknown'}
            />
            {a.hasError && a.otelStatusDescription && (
              <LabeledBlock label="Error">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.otelStatusDescription}
                </Bubble>
              </LabeledBlock>
            )}
            {a.hasError && a.otelStatusCode && (
              <Info label="Status code" value={a.otelStatusCode} />
            )}
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'user_message':
      return (
        <>
          <Section>
            <Info
              label="Message content"
              value={a.messageContent || 'Message content not available'}
            />
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'ai_assistant_message':
      return (
        <>
          <Section>
            <Info label="Sub agent" value={a.subAgentName || 'Unknown'} />
            <AssistantMessageContent
              content={a.aiResponseContent || 'Response content not available'}
            />

            <StatusBadge status={a.status} />
            <Info label="Activity timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'context_fetch':
      return (
        <Section>
          <LabeledBlock label="URL">
            <Bubble className=" break-all">{a.toolResult || 'URL not available'}</Bubble>
          </LabeledBlock>
          <StatusBadge status={a.status} />
          <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
        </Section>
      );

    case 'context_resolution':
      return (
        <>
          <Section>
            {a.contextTrigger && <Info label="Trigger" value={a.contextTrigger} />}
            <StatusBadge status={a.status} />
            {a.contextStatusDescription && (
              <LabeledBlock label="Status description">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.contextStatusDescription}
                </Bubble>
              </LabeledBlock>
            )}
            {a.contextUrl && (
              <LabeledBlock label="Context URL">
                <CodeBubble className="break-all">{a.contextUrl}</CodeBubble>
              </LabeledBlock>
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'delegation':
      return (
        <>
          <Section>
            <Info label="From sub agent" value={a.delegationFromSubAgentId || 'Unknown Agent'} />
            <Info label="To sub agent" value={a.delegationToSubAgentId || 'Unknown Agent'} />
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.toolName || 'Unknown Tool'}</Badge>}
            />
            <StatusBadge status={a.status} />
            {a.status === 'error' && a.toolStatusMessage && (
              <LabeledBlock label="Status message">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.toolStatusMessage}
                </Bubble>
              </LabeledBlock>
            )}
            {a.toolCallArgs && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallArgs)}
                title="Tool arguments"
                uri="tool-arguments.json"
              />
            )}
            {a.toolCallResult && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallResult)}
                title="Tool result"
                uri="tool-result.json"
              />
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'transfer':
      return (
        <>
          <Section>
            <LabeledBlock label="From sub agent">
              <Badge variant="code">{a.transferFromSubAgentId || 'Unknown sub agent'}</Badge>
            </LabeledBlock>
            <LabeledBlock label="To sub agent">
              <Badge variant="code">{a.transferToSubAgentId || 'Unknown target'}</Badge>
            </LabeledBlock>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.toolName || 'Unknown tool'}</Badge>}
            />
            <StatusBadge status={a.status} />
            {a.status === 'error' && a.toolStatusMessage && (
              <LabeledBlock label="Status message">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.toolStatusMessage}
                </Bubble>
              </LabeledBlock>
            )}
            {a.toolCallArgs && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallArgs)}
                title="Tool arguments"
                uri="tool-arguments.json"
              />
            )}
            {a.toolCallResult && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallResult)}
                title="Tool result"
                uri="tool-result.json"
              />
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'tool_purpose':
      return (
        <>
          <Section>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.toolName || 'Unknown tool'}</Badge>}
            />
            {a.toolType && (
              <LabeledBlock label="Tool type">
                <Badge variant="code" className="text-xs">
                  {a.toolType}
                </Badge>
              </LabeledBlock>
            )}
            <Info label="Purpose" value={a.toolPurpose || 'No purpose information available'} />
            <Info label="Sub agent" value={a.subAgentName || 'Unknown sub agent'} />
            <StatusBadge status={a.status} />
            {a.status === 'error' && a.toolStatusMessage && (
              <LabeledBlock label="Status message">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.toolStatusMessage}
                </Bubble>
              </LabeledBlock>
            )}
            {a.toolCallArgs && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallArgs)}
                title="Tool arguments"
                uri="tool-arguments.json"
              />
            )}
            {a.toolCallResult && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallResult)}
                title="Tool result"
                uri="tool-result.json"
              />
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'generic_tool':
      return (
        <>
          <Section>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.toolName || 'Unknown Tool'}</Badge>}
            />
            {a.toolType && (
              <LabeledBlock label="Tool type">
                <Badge variant="code" className="text-xs">
                  {a.toolType}
                </Badge>
              </LabeledBlock>
            )}
            <StatusBadge status={a.status} />
            {a.status === 'error' && a.toolStatusMessage && (
              <LabeledBlock label="Status message">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.toolStatusMessage}
                </Bubble>
              </LabeledBlock>
            )}
            {a.toolCallArgs && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallArgs)}
                title="Tool arguments"
                uri="tool-arguments.json"
              />
            )}
            {a.toolCallResult && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.toolCallResult)}
                title="Tool result"
                uri="tool-result.json"
              />
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'ai_model_streamed_text':
      return (
        <>
          <Section>
            <Info label="Model" value={<ModelBadge model={a.aiStreamTextModel || 'Unknown'} />} />

            {a.aiTelemetryFunctionId && (
              <Info
                label="Sub agent"
                value={<Badge variant="code">{a.aiTelemetryFunctionId}</Badge>}
              />
            )}
            <Info label="Input tokens" value={a.inputTokens?.toLocaleString() || '0'} />
            <Info label="Output tokens" value={a.outputTokens?.toLocaleString() || '0'} />
            {a.contextBreakdown && <ContextBreakdownPanel breakdown={a.contextBreakdown} />}
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'ai_model_streamed_object':
      return (
        <>
          <Section>
            <Info label="Model" value={<ModelBadge model={a.aiStreamObjectModel || 'Unknown'} />} />
            {a.aiTelemetryFunctionId && (
              <Info
                label="Sub agent"
                value={<Badge variant="code">{a.aiTelemetryFunctionId}</Badge>}
              />
            )}
            <Info label="Input tokens" value={a.inputTokens?.toLocaleString() || '0'} />
            <Info label="Output tokens" value={a.outputTokens?.toLocaleString() || '0'} />
            {a.contextBreakdown && <ContextBreakdownPanel breakdown={a.contextBreakdown} />}
            {a.aiStreamObjectContent && (
              <LabeledBlock label="Structured object response">
                <JsonEditorWithCopy
                  value={formatJsonSafely(a.aiStreamObjectContent)}
                  title="Object content"
                  uri="stream-object-response.json"
                />
              </LabeledBlock>
            )}
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'artifact_processing':
      return (
        <>
          <Section>
            {a.artifactName && <Info label="Name" value={a.artifactName} />}
            {a.artifactType && <Info label="Type" value={a.artifactType} />}
            {a.artifactDescription && <Info label="Description" value={a.artifactDescription} />}
            {a.artifactData && (
              <JsonEditorWithCopy
                value={formatJsonSafely(a.artifactData)}
                title="Artifact data"
                uri="artifact-data.json"
              />
            )}
            <StatusBadge status={a.status} />
            {a.artifactSubAgentId && (
              <Info label="Sub agent" value={a.artifactSubAgentId || 'Unknown Sub Agent'} />
            )}
            {a.artifactId && (
              <Info label="Artifact ID" value={<Badge variant="code">{a.artifactId}</Badge>} />
            )}
            {a.artifactToolCallId && (
              <Info
                label="Tool call ID"
                value={<Badge variant="code">{a.artifactToolCallId}</Badge>}
              />
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'tool_approval_requested':
      return (
        <>
          <Section>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.approvalToolName || 'Unknown Tool'}</Badge>}
            />
            <LabeledBlock label="Status">
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                Waiting for approval
              </Badge>
            </LabeledBlock>
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'tool_approval_approved':
      return (
        <>
          <Section>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.approvalToolName || 'Unknown Tool'}</Badge>}
            />
            <LabeledBlock label="Status">
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                Approved by user
              </Badge>
            </LabeledBlock>
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    case 'tool_approval_denied':
      return (
        <>
          <Section>
            <Info
              label="Tool name"
              value={<Badge variant="code">{a.approvalToolName || 'Unknown Tool'}</Badge>}
            />
            <LabeledBlock label="Status">
              <Badge variant="outline" className="text-red-600 border-red-600">
                Denied by user
              </Badge>
            </LabeledBlock>
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          {SignozButton}
          {AdvancedBlock}
        </>
      );

    default:
      return null;
  }
}
