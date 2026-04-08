import {
  APPROVAL_NEEDED_EVENT,
  APPROVAL_RESOLVED_EVENT,
  parseEmbeddedJson,
} from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { getLogger, runWithLogContext } from '../../../../logger';
import { pendingToolApprovalManager } from '../../session/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../../session/ToolApprovalUiBus';
import { createDeniedToolResult } from '../../utils/tool-result';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('Agent');

export async function waitForToolApproval(
  ctx: AgentRunContext,
  toolCallId: string,
  toolName: string,
  args: unknown,
  providerMetadata: unknown
): Promise<
  { approved: false; deniedResult: unknown } | { approved: true } | { approved: 'pending' }
> {
  return runWithLogContext({ toolCallId, toolName }, () =>
    waitForToolApprovalInner(ctx, toolCallId, toolName, args, providerMetadata)
  );
}

async function waitForToolApprovalInner(
  ctx: AgentRunContext,
  toolCallId: string,
  toolName: string,
  args: unknown,
  providerMetadata: unknown
): Promise<
  { approved: false; deniedResult: unknown } | { approved: true } | { approved: 'pending' }
> {
  logger.info({ args }, 'Tool requires approval - waiting for user response');

  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent('tool.approval.requested', {
      'tool.name': toolName,
      'tool.callId': toolCallId,
      'subAgent.id': ctx.config.id,
    });
  }

  const baseSpanAttributes = {
    'tool.name': toolName,
    'tool.callId': toolCallId,
    'subAgent.id': ctx.config.id,
    'subAgent.name': ctx.config.name,
    ...(ctx.conversationId ? { 'conversation.id': ctx.conversationId } : {}),
  };

  if (ctx.durableWorkflowRunId) {
    const approvedToolCalls = ctx.approvedToolCalls;
    if (approvedToolCalls) {
      const preApproved = approvedToolCalls[toolCallId];
      if (preApproved !== undefined) {
        delete approvedToolCalls[toolCallId];

        if (!preApproved.approved) {
          const deniedResult = tracer.startActiveSpan(
            'tool.approval_denied',
            {
              attributes: {
                ...baseSpanAttributes,
                'tool.approval.reason': preApproved.reason,
              },
            },
            (denialSpan: Span) => {
              logger.info(
                { reason: preApproved.reason },
                'Tool execution denied (durable pre-approved decision)'
              );
              denialSpan.setStatus({ code: SpanStatusCode.OK });
              denialSpan.end();
              return createDeniedToolResult(toolCallId, preApproved.reason);
            }
          );
          return { approved: false, deniedResult };
        }

        tracer.startActiveSpan(
          'tool.approval_approved',
          { attributes: baseSpanAttributes },
          (approvedSpan: Span) => {
            logger.info('Tool approved (durable pre-approved decision)');
            approvedSpan.setStatus({ code: SpanStatusCode.OK });
            approvedSpan.end();
          }
        );
        return { approved: true };
      }
    }

    tracer.startActiveSpan(
      'tool.approval_requested',
      { attributes: baseSpanAttributes },
      (requestSpan: Span) => {
        requestSpan.setStatus({ code: SpanStatusCode.OK });
        requestSpan.end();
      }
    );

    const streamHelper = ctx.isDelegatedAgent ? undefined : ctx.streamHelper;
    if (streamHelper) {
      try {
        await streamHelper.writeToolApprovalRequest({
          approvalId: `aitxt-${toolCallId}`,
          toolCallId,
          toolName,
          input: args as Record<string, unknown>,
        });
      } catch (sseError) {
        logger.warn(
          { error: sseError instanceof Error ? sseError.message : String(sseError) },
          'Failed to stream tool approval request to client — approval is persisted and recoverable via polling'
        );
      }
    }

    ctx.pendingDurableApproval = { toolCallId, toolName, args };
    return { approved: 'pending' };
  }

  tracer.startActiveSpan(
    'tool.approval_requested',
    { attributes: baseSpanAttributes },
    (requestSpan: Span) => {
      requestSpan.setStatus({ code: SpanStatusCode.OK });
      requestSpan.end();
    }
  );

  const streamHelper = ctx.isDelegatedAgent ? undefined : ctx.streamHelper;
  if (streamHelper) {
    await streamHelper.writeToolApprovalRequest({
      approvalId: `aitxt-${toolCallId}`,
      toolCallId,
      toolName,
      input: args as Record<string, unknown>,
    });
  } else if (ctx.isDelegatedAgent) {
    const currentStreamRequestId = ctx.streamRequestId ?? '';
    if (currentStreamRequestId) {
      await toolApprovalUiBus.publish(currentStreamRequestId, {
        type: APPROVAL_NEEDED_EVENT,
        toolCallId,
        toolName,
        input: args,
        providerMetadata,
        approvalId: `aitxt-${toolCallId}`,
      });
    }
  }

  const approvalResult = await pendingToolApprovalManager.waitForApproval(
    toolCallId,
    toolName,
    args,
    ctx.conversationId || 'unknown',
    ctx.config.id
  );

  if (!approvalResult.approved) {
    if (!streamHelper && ctx.isDelegatedAgent) {
      const currentStreamRequestId = ctx.streamRequestId ?? '';
      if (currentStreamRequestId) {
        await toolApprovalUiBus.publish(currentStreamRequestId, {
          type: APPROVAL_RESOLVED_EVENT,
          toolCallId,
          approved: false,
          reason: approvalResult.reason,
        });
      }
    }

    const deniedResult = tracer.startActiveSpan(
      'tool.approval_denied',
      {
        attributes: {
          ...baseSpanAttributes,
          'tool.approval.reason': approvalResult.reason,
        },
      },
      (denialSpan: Span) => {
        logger.info({ reason: approvalResult.reason }, 'Tool execution denied by user');
        denialSpan.setStatus({ code: SpanStatusCode.OK });
        denialSpan.end();
        return createDeniedToolResult(toolCallId, approvalResult.reason);
      }
    );

    return { approved: false, deniedResult };
  }

  tracer.startActiveSpan(
    'tool.approval_approved',
    { attributes: baseSpanAttributes },
    (approvedSpan: Span) => {
      logger.info('Tool approved, continuing with execution');
      approvedSpan.setStatus({ code: SpanStatusCode.OK });
      approvedSpan.end();
    }
  );

  if (!streamHelper && ctx.isDelegatedAgent) {
    const currentStreamRequestId = ctx.streamRequestId ?? '';
    if (currentStreamRequestId) {
      await toolApprovalUiBus.publish(currentStreamRequestId, {
        type: APPROVAL_RESOLVED_EVENT,
        toolCallId,
        approved: true,
      });
    }
  }

  return { approved: true };
}

export function recordDenial(
  ctx: AgentRunContext,
  toolName: string,
  toolCallId: string,
  reason: string | undefined
): void {
  ctx.taskDenialRedirects.push({
    toolName,
    toolCallId,
    reason: reason ?? 'Tool call was denied by the user.',
  });
}

export async function parseAndCheckApproval<T>(
  ctx: AgentRunContext,
  toolName: string,
  toolCallId: string,
  args: T,
  providerMetadata: unknown,
  needsApproval: boolean
): Promise<
  { args: T; denied: false; pendingApproval?: true } | { args: T; denied: true; result: unknown }
> {
  return runWithLogContext({ toolCallId, toolName }, async () => {
    let processedArgs: T;
    try {
      processedArgs = parseEmbeddedJson(args);
      if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
        logger.warn('Fixed stringified JSON parameters (indicates schema ambiguity)');
      }
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        'Failed to parse embedded JSON, using original args'
      );
      processedArgs = args;
    }

    if (needsApproval) {
      const approval = await waitForToolApproval(ctx, toolCallId, toolName, args, providerMetadata);
      if (approval.approved === 'pending') {
        return { args: processedArgs, denied: false, pendingApproval: true };
      }
      if (!approval.approved) {
        const deniedResult = approval.deniedResult as { reason?: string } | undefined;
        recordDenial(ctx, toolName, toolCallId, deniedResult?.reason);
        return { args: processedArgs, denied: true, result: approval.deniedResult };
      }
    }

    return { args: processedArgs, denied: false };
  });
}
