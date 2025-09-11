/**
 * Shared utilities for formatting agent descriptions with transfer/delegate information
 * Reduces code duplication between database and SDK implementations
 */

export interface RelationInfo {
  id: string;
  name: string;
  description?: string | null;
  relationType: 'transfer' | 'delegate';
}

export interface ExternalRelationInfo extends RelationInfo {
  externalAgent?: {
    name: string;
    description?: string | null;
  };
}

export type CombinedRelationInfo = RelationInfo | ExternalRelationInfo;

/**
 * Format transfer and delegate information into a human-readable string
 * Used by both database and SDK implementations
 */
export function formatTransferAndDelegateInfo(
  transfers: CombinedRelationInfo[],
  delegates: CombinedRelationInfo[]
): string {
  if (transfers.length === 0 && delegates.length === 0) {
    return '';
  }

  let connectionInfo = '';

  // Add transfer information
  if (transfers.length > 0) {
    const transferList = transfers
      .map((relation) => {
        // Handle both internal and external relations
        if ('externalAgent' in relation && relation.externalAgent) {
          const { name, description } = relation.externalAgent;
          return `- ${name}: ${description || ''}`;
        } else {
          const { name, description } = relation;
          return `- ${name}: ${description || ''}`;
        }
      })
      .filter(Boolean)
      .join('\n');
    connectionInfo += `\n\nCan transfer to:\n${transferList}`;
  }

  // Add delegation information
  if (delegates.length > 0) {
    const delegateList = delegates
      .map((relation) => {
        // Handle both internal and external relations
        if ('externalAgent' in relation && relation.externalAgent) {
          const { name, description } = relation.externalAgent;
          return `- ${name}: ${description || ''}`;
        } else {
          const { name, description } = relation;
          return `- ${name}: ${description || ''}`;
        }
      })
      .filter(Boolean)
      .join('\n');
    connectionInfo += `\n\nCan delegate to:\n${delegateList}`;
  }

  return connectionInfo;
}

/**
 * Enhanced description generation with pre-computed relation data
 * Avoids redundant database calls by accepting optional relations
 */
export function generateEnhancedDescription(
  baseDescription: string,
  transfers: CombinedRelationInfo[],
  delegates: CombinedRelationInfo[]
): string {
  const connectionInfo = formatTransferAndDelegateInfo(transfers, delegates);
  return baseDescription + connectionInfo;
}

/**
 * Extract and categorize relations by type
 */
export function categorizeRelations(
  internalRelations: RelationInfo[],
  externalRelations: ExternalRelationInfo[]
): { transfers: CombinedRelationInfo[]; delegates: CombinedRelationInfo[] } {
  const transfers = [
    ...internalRelations.filter((rel) => rel.relationType === 'transfer'),
    ...externalRelations.filter((rel) => rel.relationType === 'transfer'),
  ];

  const delegates = [
    ...internalRelations.filter((rel) => rel.relationType === 'delegate'),
    ...externalRelations.filter((rel) => rel.relationType === 'delegate'),
  ];

  return { transfers, delegates };
}