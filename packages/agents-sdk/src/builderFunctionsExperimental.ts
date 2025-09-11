/**
 * Creates an agent relation configuration.
 *
 * Relations define how agents can interact with each other.
 * Transfer relations allow handoffs, while delegate relations
 * allow temporary task delegation.
 *
 * @param targetAgent - The ID of the target agent
 * @param relationType - The type of relation (transfer or delegate)
 * @returns An agent relation configuration
 *
 * @example
 * ```typescript
 * const transferRelation = agentRelation('support-agent', 'transfer');
 * const delegateRelation = agentRelation('specialist-agent', 'delegate');
 * ```
 */

export function agentRelation(
  targetAgent: string,
  relationType: 'transfer' | 'delegate' = 'transfer'
) {
  return {
    targetAgent,
    relationType,
  };
}
