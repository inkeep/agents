export type ContractViolationPolicy = 'retry' | 'reject' | 'warn';

export class ContractViolationError extends Error {
  readonly subAgentId: string;
  readonly policy: ContractViolationPolicy;
  readonly attemptedRetries: number;
  readonly lastResponseText: string;
  /** Human-readable description of which contract rule was violated. */
  readonly reason: string;

  constructor(params: {
    subAgentId: string;
    policy: ContractViolationPolicy;
    attemptedRetries: number;
    lastResponseText: string;
    reason: string;
  }) {
    super(
      `Sub-agent '${params.subAgentId}' violated its output contract: ${params.reason} (policy: ${params.policy}, retries: ${params.attemptedRetries})`
    );
    this.name = 'ContractViolationError';
    this.subAgentId = params.subAgentId;
    this.policy = params.policy;
    this.attemptedRetries = params.attemptedRetries;
    this.lastResponseText = params.lastResponseText;
    this.reason = params.reason;
  }
}
