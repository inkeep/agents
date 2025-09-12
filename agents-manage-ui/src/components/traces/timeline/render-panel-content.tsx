import { Streamdown } from 'streamdown';
import { formatDateTime } from '@/app/utils/format-date';
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
import type { ConversationDetail, SelectedPanel } from '@/components/traces/timeline/types';
import { Badge } from '@/components/ui/badge';

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
        <Info
          label="Tool Name"
          value={
            <Badge variant="code" className="">
              {e.toolName}
            </Badge>
          }
        />
        <LabeledBlock label="Error Message">
          <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {e.error}
          </Bubble>
        </LabeledBlock>
        <LabeledBlock label="Failure Reason">
          <Bubble className="bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300">
            {e.failureReason}
          </Bubble>
        </LabeledBlock>
        <Info
          label="Span ID"
          value={
            <Badge variant="code" className="">
              {e.spanId}
            </Badge>
          }
        />
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

  const AdvancedBlock = (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground mb-2">Span Attributes:</div>
      {span ? (
        <Streamdown>{`\`\`\`json\n${JSON.stringify(span, null, 2)}\n\`\`\``}</Streamdown>
      ) : (
        <div className="text-center py-4 text-xs text-muted-foreground">Span not found</div>
      )}
    </div>
  );

  switch (selected.type) {
    case 'ai_generation':
      console.log('A is', a);
      return (
        <>
          <Section>
            <Info label="Model" value={<ModelBadge model={a.aiModel || 'Unknown'} />} />
            <Info label="Input Tokens" value={a.inputTokens?.toLocaleString() || '0'} />
            <Info label="Output Tokens" value={a.outputTokens?.toLocaleString() || '0'} />
            <Info label="Agent" value={a.agentName || '-'} />
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
            <LabeledBlock label="Message Content">
              <Bubble className="">{a.messageContent || 'Message content not available'}</Bubble>
            </LabeledBlock>
            <Info label="Message Length" value={`${a.messageContent?.length || 0} characters`} />
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
            <LabeledBlock label="AI Response Content">
              <Bubble className=" whitespace-pre-wrap break-words">
                {a.aiResponseContent || 'Response content not available'}
              </Bubble>
            </LabeledBlock>
            <Info label="Agent" value={a.agentName || 'Unknown'} />
            <StatusBadge status={a.status} />
            <Info label="Activity Timestamp" value={formatDateTime(a.timestamp)} />
            <Info
              label="Message ID"
              value={
                <Badge variant="code" className="">
                  {a.id}
                </Badge>
              }
            />
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
            {a.contextAgentGraphId && (
              <LabeledBlock label="Agent Graph ID">
                <Badge variant="code" className="">
                  {a.contextAgentGraphId}
                </Badge>
              </LabeledBlock>
            )}
            {a.contextTrigger && <Info label="Trigger" value={a.contextTrigger} />}
            <StatusBadge status={a.status} />
            {a.contextStatusDescription && (
              <LabeledBlock label="Status Description">
                <Bubble className="bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {a.contextStatusDescription}
                </Bubble>
              </LabeledBlock>
            )}
            {a.contextUrl && (
              <LabeledBlock label="Context URL">
                <CodeBubble className=" break-all">{a.contextUrl}</CodeBubble>
              </LabeledBlock>
            )}
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
          </Section>
          <Divider />
          <div className="mt-2">
            {SignozButton}
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">Span Attributes:</div>
              {span ? (
                <Streamdown>{`\`\`\`json\n${JSON.stringify(span, null, 2)}\n\`\`\``}</Streamdown>
              ) : (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Context resolver span not found
                </div>
              )}
            </div>
          </div>
        </>
      );

    case 'delegation':
      return (
        <>
          <Section>
            <LabeledBlock label="From Agent">
              <Badge variant="code" className="">
                {a.delegationFromAgentId || a.agentName || 'Unknown Agent'}
              </Badge>
            </LabeledBlock>
            <LabeledBlock label="To Agent">
              <Badge variant="code" className="">
                {a.delegationToAgentId ||
                  a.toolName?.replace('delegate_to_', '') ||
                  'Unknown Target'}
              </Badge>
            </LabeledBlock>
            <Info
              label="Tool Name"
              value={
                <Badge variant="code" className="">
                  {a.toolName || 'Unknown Tool'}
                </Badge>
              }
            />
            <StatusBadge status={a.status} />
            <Info label="Result" value={a.toolResult || 'No result available'} />
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
            <LabeledBlock label="From Agent">
              <Badge variant="code" className="">
                {a.transferFromAgentId || a.agentName || 'Unknown Agent'}
              </Badge>
            </LabeledBlock>
            <LabeledBlock label="To Agent">
              <Badge variant="code" className="">
                {a.transferToAgentId || a.toolName?.replace('transfer_to_', '') || 'Unknown Target'}
              </Badge>
            </LabeledBlock>
            <Info
              label="Tool Name"
              value={
                <Badge variant="code" className="">
                  {a.toolName || 'Unknown Tool'}
                </Badge>
              }
            />
            <StatusBadge status={a.status} />
            <Info label="Result" value={a.toolResult || 'No result available'} />
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
              label="Tool Name"
              value={
                <Badge variant="code" className="">
                  {a.toolName || 'Unknown Tool'}
                </Badge>
              }
            />
            {a.toolType && (
              <LabeledBlock label="Tool Type">
                <Badge variant="code" className="text-xs">
                  {a.toolType}
                </Badge>
              </LabeledBlock>
            )}
            <LabeledBlock label="Purpose">
              <Bubble className="b">{a.toolPurpose || 'No purpose information available'}</Bubble>
            </LabeledBlock>
            <Info label="Agent" value={a.agentName || 'Unknown Agent'} />
            <StatusBadge status={a.status} />
            <Info label="Result" value={a.toolResult || 'No result available'} />
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
              label="Tool Name"
              value={
                <Badge variant="code" className="">
                  {a.toolName || 'Unknown Tool'}
                </Badge>
              }
            />
            {a.toolType && (
              <LabeledBlock label="Tool Type">
                <Badge variant="code" className="text-xs">
                  {a.toolType}
                </Badge>
              </LabeledBlock>
            )}
            <StatusBadge status={a.status} />
            <Info label="Result" value={a.toolResult || 'No result available'} />
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
            <Info
              label="Operation ID"
              value={
                <Badge variant="code" className="">
                  {a.aiStreamTextOperationId || 'Unknown'}
                </Badge>
              }
            />
            <Info label="Input Tokens" value={a.inputTokens?.toLocaleString() || '0'} />
            <Info label="Output Tokens" value={a.outputTokens?.toLocaleString() || '0'} />
            <StatusBadge status={a.status} />
            <Info label="Timestamp" value={formatDateTime(a.timestamp)} />
            <LabeledBlock label="Streamed Text Content">
              <Bubble className="whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                {a.aiStreamTextContent || 'No content available'}
              </Bubble>
            </LabeledBlock>
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
