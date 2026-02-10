import {
  createAnonymousUser,
  type FullExecutionContext,
  generateAnonymousToken,
  generateId,
  SpiceDbResourceTypes,
  writeRelationship,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('anonymousUser');

export interface AnonymousUserInfo {
  anonymousUserId: string;
  token?: string;
  isNew: boolean;
}

export function isAnonymousRequest(executionContext: FullExecutionContext): boolean {
  return executionContext.metadata?.anonymous === true;
}

export async function resolveAnonymousUser(
  executionContext: FullExecutionContext
): Promise<AnonymousUserInfo | null> {
  if (!isAnonymousRequest(executionContext)) {
    return null;
  }

  const { tenantId, projectId } = executionContext;
  const metadata = executionContext.metadata as Record<string, unknown>;

  if (metadata.isNewAnonymousUser) {
    const anonymousUserId = `anon_${generateId()}`;
    await createAnonymousUser(runDbClient)({
      id: anonymousUserId,
      tenantId,
      projectId,
    });

    const token = await generateAnonymousToken({ anonymousUserId, tenantId, projectId });

    logger.info({ anonymousUserId, tenantId, projectId }, 'Created new anonymous user');

    return { anonymousUserId, token, isNew: true };
  }

  const anonymousUserId = metadata.anonymousUserId as string;
  return { anonymousUserId, isNew: false };
}

export async function writeAnonymousConversationRelationships(params: {
  conversationId: string;
  anonymousUserId: string;
  projectId: string;
}): Promise<void> {
  const { conversationId, anonymousUserId, projectId } = params;

  try {
    await writeRelationship({
      resourceType: SpiceDbResourceTypes.CONVERSATION,
      resourceId: conversationId,
      relation: 'participant',
      subjectType: SpiceDbResourceTypes.ANONYMOUS_USER,
      subjectId: anonymousUserId,
    });
  } catch (err) {
    logger.warn(
      { err, conversationId, anonymousUserId },
      'Failed to write SpiceDB participant relationship (non-fatal)'
    );
  }

  try {
    await writeRelationship({
      resourceType: SpiceDbResourceTypes.CONVERSATION,
      resourceId: conversationId,
      relation: 'project',
      subjectType: SpiceDbResourceTypes.PROJECT,
      subjectId: projectId,
    });
  } catch (err) {
    logger.warn(
      { err, conversationId, projectId },
      'Failed to write SpiceDB project relationship (non-fatal)'
    );
  }
}
