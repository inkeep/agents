import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('governance');

export interface GovernanceOptions<TArgs = any> {
  /**
   * Policy identifier string or a boolean policy function that evaluates tool call arguments.
   */
  policy?: string | ((args: TArgs) => boolean | Promise<boolean>);
  /**
   * Custom handler called when governance denies execution.
   */
  onDeny?: (reason: string, args: TArgs) => any;
  /**
   * Custom error message returned when fail-closed contract blocks execution.
   */
  failClosedErrorMessage?: string;
}

/**
 * Wraps a tool handler function with a fail-closed governance boundary (CCS Conformance / CWE-636 mitigation).
 * If the policy function throws an exception, rejects, or evaluates to false, the underlying tool
 * handler is GUARANTEED to NOT be called.
 *
 * @param handler The target tool function to govern.
 * @param options Governance configuration options.
 */
export function govern<TArgs = any, TResult = any>(
  handler: (args: TArgs) => Promise<TResult> | TResult,
  options: GovernanceOptions<TArgs> = {}
): (args: TArgs) => Promise<TResult> {
  const {
    policy = 'default',
    failClosedErrorMessage = 'Governance policy check failed: execution blocked by fail-closed contract',
  } = options;

  return async (args: TArgs): Promise<TResult> => {
    let allowed = false;
    let policyError: Error | null = null;

    try {
      if (typeof policy === 'function') {
        allowed = await policy(args);
      } else {
        allowed = true;
      }
    } catch (err) {
      allowed = false;
      policyError = err instanceof Error ? err : new Error(String(err));
    }

    if (!allowed) {
      const reason = policyError
        ? `Governance exception: ${policyError.message}`
        : `Policy '${typeof policy === 'string' ? policy : 'custom'}' denied execution`;

      logger.warn(
        {
          policy: typeof policy === 'string' ? policy : 'custom',
          reason,
          hasError: !!policyError,
        },
        'Governance interceptor blocked tool execution (fail-closed)'
      );

      if (options.onDeny) {
        return options.onDeny(reason, args);
      }

      throw new Error(`${failClosedErrorMessage} (${reason})`);
    }

    return await handler(args);
  };
}
