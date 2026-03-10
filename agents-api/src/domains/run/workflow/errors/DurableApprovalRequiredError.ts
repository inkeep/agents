export class DurableApprovalRequiredError extends Error {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: unknown;

  constructor(toolCallId: string, toolName: string, args: unknown) {
    super(`Tool "${toolName}" requires approval (durable mode)`);
    this.name = 'DurableApprovalRequiredError';
    this.toolCallId = toolCallId;
    this.toolName = toolName;
    this.args = args;
  }
}
