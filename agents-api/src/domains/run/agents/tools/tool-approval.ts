import { parseEmbeddedJson } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { getLogger } from '../../../../logger';
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
): Promise<{ approved: false; deniedResult: unknown } | { approved: true }> {
  logger.info({ toolName, toolCallId, args }, 'Tool requires approval - waiting for user response');

  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent('tool.approval.requested', {
      'tool.name': toolName,
      'tool.callId': toolCallId,
      'subAgent.id': ctx.config.id,
    });
  }

  tracer.startActiveSpan(
    'tool.approval_requested',
    {
      attributes: {
        'tool.name': toolName,
        'tool.callId': toolCallId,
        'subAgent.id': ctx.config.id,
        'subAgent.name': ctx.config.name,
      },
    },
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
        type: 'approval-needed',
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
          type: 'approval-resolved',
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
          'tool.name': toolName,
          'tool.callId': toolCallId,
          'subAgent.id': ctx.config.id,
          'subAgent.name': ctx.config.name,
          'tool.approval.reason': approvalResult.reason,
        },
      },
      (denialSpan: Span) => {
        logger.info(
          { toolName, toolCallId, reason: approvalResult.reason },
          'Tool execution denied by user'
        );
        denialSpan.setStatus({ code: SpanStatusCode.OK });
        denialSpan.end();
        return createDeniedToolResult(toolCallId, approvalResult.reason);
      }
    );

    return { approved: false, deniedResult };
  }

  tracer.startActiveSpan(
    'tool.approval_approved',
    {
      attributes: {
        'tool.name': toolName,
        'tool.callId': toolCallId,
        'subAgent.id': ctx.config.id,
        'subAgent.name': ctx.config.name,
      },
    },
    (approvedSpan: Span) => {
      logger.info({ toolName, toolCallId }, 'Tool approved, continuing with execution');
      approvedSpan.setStatus({ code: SpanStatusCode.OK });
      approvedSpan.end();
    }
  );

  if (!streamHelper && ctx.isDelegatedAgent) {
    const currentStreamRequestId = ctx.streamRequestId ?? '';
    if (currentStreamRequestId) {
      await toolApprovalUiBus.publish(currentStreamRequestId, {
        type: 'approval-resolved',
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
): Promise<{ args: T; denied: false } | { args: T; denied: true; result: unknown }> {
  let processedArgs: T;
  try {
    processedArgs = parseEmbeddedJson(args);
    if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
      logger.warn(
        { toolName, toolCallId },
        'Fixed stringified JSON parameters (indicates schema ambiguity)'
      );
    }
  } catch (error) {
    logger.warn(
      { toolName, toolCallId, error: (error as Error).message },
      'Failed to parse embedded JSON, using original args'
    );
    processedArgs = args;
  }

  if (needsApproval) {
    const approval = await waitForToolApproval(ctx, toolCallId, toolName, args, providerMetadata);
    if (!approval.approved) {
      const deniedResult = approval.deniedResult as { reason?: string } | undefined;
      recordDenial(ctx, toolName, toolCallId, deniedResult?.reason);
      return { args: processedArgs, denied: true, result: approval.deniedResult };
    }
  }

  return { args: processedArgs, denied: false };
}
