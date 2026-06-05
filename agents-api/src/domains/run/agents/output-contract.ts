import type { OutputContract } from '@inkeep/agents-core';
import { TRANSFER_TOOL_PREFIX } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { ArtifactParser } from '../artifacts/ArtifactParser';
import { ARTIFACT_CREATE_PREFIX } from '../artifacts/artifact-component-schema';
import { ContractViolationError } from '../errors';
import type { AgentRunContext, ResolvedGenerationResponse } from './agent-types';

export function resolveAllowText(outputContract: OutputContract | undefined): boolean {
  return outputContract?.allowText ?? true;
}

export function deriveContractEnforcement(params: {
  outputContract: OutputContract | undefined;
  resolvedAllowText: boolean;
  hasStructuredOutput: boolean;
}): boolean {
  const { outputContract, resolvedAllowText, hasStructuredOutput } = params;
  return (
    hasStructuredOutput ||
    resolvedAllowText === false ||
    (outputContract?.requireComponent?.length ?? 0) > 0 ||
    (outputContract?.requireArtifact?.length ?? 0) > 0 ||
    outputContract?.requireTransfer === true
  );
}

export function resolveContractToolChoice(params: {
  resolvedAllowText: boolean;
  hasStructuredOutput: boolean;
  hasArtifactComponents: boolean;
}): 'auto' | 'required' {
  const { resolvedAllowText, hasStructuredOutput, hasArtifactComponents } = params;
  return resolvedAllowText === false && !hasStructuredOutput && !hasArtifactComponents
    ? 'required'
    : 'auto';
}

/**
 * Returns a human-readable description of the first contract rule the response
 * violates, or null when the contract is satisfied. The description names the
 * offending rule and what was expected vs. emitted, so the failure is
 * diagnosable from the error/trace alone.
 */
export function getContractViolation(params: {
  ctx: AgentRunContext;
  response: ResolvedGenerationResponse;
  hasStructuredOutput: boolean;
}): string | null {
  const { ctx, response, hasStructuredOutput } = params;
  const contract = ctx.config.outputContract;
  if (!contract) {
    return null;
  }

  const lastStep = response.steps?.at(-1) as
    | { toolCalls?: Array<{ toolName?: string }> }
    | undefined;
  const lastStepToolCalls = lastStep?.toolCalls ?? [];
  const componentNames: Array<string | undefined> =
    response.output?.dataComponents?.map((dc: { name?: string }) => dc?.name) ?? [];
  const emitted = componentNames.filter(Boolean).join(', ') || 'none';

  if (ctx.resolvedAllowText === false) {
    const producedStructured = hasStructuredOutput && Boolean(response.output);
    const producedToolCall = lastStepToolCalls.length > 0;
    if (!producedStructured && !producedToolCall) {
      return 'free text is disallowed (allowText: false) but the turn produced no data component, artifact, transfer, or tool call';
    }
  }

  const missingComponents = (contract.requireComponent ?? []).filter(
    (name) => !componentNames.includes(name)
  );
  if (missingComponents.length > 0) {
    return `requireComponent — the response must include data component(s) [${missingComponents.join(', ')}] but emitted [${emitted}]`;
  }

  // An artifact requirement is met by creating OR referencing the artifact
  // (D-K), in either form — a structured data component or an <artifact:*>
  // text marker. A reference carries only an artifact id, resolved to a type
  // against ctx.config.artifacts.
  const responseText = response.text ?? '';
  const artifactsById = ctx.config.artifacts ?? {};
  const presentArtifactTypes = new Set<string>(
    ArtifactParser.parseCreateAnnotations(responseText).map((annotation) => annotation.type)
  );
  const addReferencedType = (artifactId: unknown) => {
    const type = typeof artifactId === 'string' ? artifactsById[artifactId]?.type : undefined;
    if (type) {
      presentArtifactTypes.add(type);
    }
  };
  for (const refId of ArtifactParser.parseRefIds(responseText)) {
    addReferencedType(refId);
  }
  for (const dc of response.output?.dataComponents ?? []) {
    if (dc?.name === 'Artifact') {
      addReferencedType((dc as { props?: { artifact_id?: unknown } })?.props?.artifact_id);
    }
  }
  const missingArtifacts = (contract.requireArtifact ?? []).filter(
    (name) =>
      !componentNames.includes(`${ARTIFACT_CREATE_PREFIX}${name}`) &&
      !presentArtifactTypes.has(name)
  );
  if (missingArtifacts.length > 0) {
    const createdViaDataComponent = componentNames.flatMap((n) =>
      n?.startsWith(ARTIFACT_CREATE_PREFIX) ? [n.slice(ARTIFACT_CREATE_PREFIX.length)] : []
    );
    const present =
      [...new Set([...createdViaDataComponent, ...presentArtifactTypes])].join(', ') || 'none';
    return `requireArtifact — the response must create or reference artifact(s) [${missingArtifacts.join(', ')}] but produced [${present}]`;
  }

  if (
    contract.requireTransfer === true &&
    !lastStepToolCalls.some((toolCall) => toolCall?.toolName?.startsWith(TRANSFER_TOOL_PREFIX))
  ) {
    return 'requireTransfer — the response must transfer to another sub agent, but no transfer occurred';
  }

  return null;
}

/** Boolean form of {@link getContractViolation}. */
export function isContractViolation(params: {
  ctx: AgentRunContext;
  response: ResolvedGenerationResponse;
  hasStructuredOutput: boolean;
}): boolean {
  return getContractViolation(params) !== null;
}

export function enforceOutputContract(params: {
  ctx: AgentRunContext;
  response: ResolvedGenerationResponse;
  hasStructuredOutput: boolean;
  hasContractEnforcement: boolean;
  textResponse: string;
  span: Span;
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void };
}): void {
  const { ctx, response, hasStructuredOutput, hasContractEnforcement, textResponse, span, logger } =
    params;
  const contract = ctx.config.outputContract;
  if (!hasContractEnforcement || !contract) {
    return;
  }

  const configuredPolicy = contract.onViolation ?? 'retry';
  const violationReason = getContractViolation({ ctx, response, hasStructuredOutput });
  const violated = violationReason !== null;
  const effectivePolicy = configuredPolicy === 'warn' ? 'warn' : 'reject';
  span.setAttributes({
    'agent.output_contract.violated': violated,
    'agent.output_contract.policy_applied': violated ? effectivePolicy : 'none',
    ...(violationReason ? { 'agent.output_contract.violation_reason': violationReason } : {}),
  });
  if (!violationReason) {
    return;
  }

  if (effectivePolicy === 'warn') {
    logger.warn(
      {
        agentId: ctx.config.id,
        conversationId: ctx.conversationId,
        policy: configuredPolicy,
        reason: violationReason,
      },
      'Output contract violated; onViolation=warn, surfacing fallback text'
    );
    return;
  }

  throw new ContractViolationError({
    subAgentId: ctx.config.id,
    policy: effectivePolicy,
    attemptedRetries: 0,
    lastResponseText: textResponse,
    reason: violationReason,
  });
}
