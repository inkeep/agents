import { addUserToOrganization, getUserByEmail, upsertOrganization } from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';
import runDbClient from './data/db/runDbClient';
import { env } from './env';
import { getLogger } from './logger';

const logger = getLogger('initialization');

export async function initializeDefaultUser(authInstance?: ReturnType<typeof createAuth> | null) {
  const { INKEEP_AGENTS_MANAGE_UI_USERNAME, INKEEP_AGENTS_MANAGE_UI_PASSWORD, DISABLE_AUTH } = env;
  const hasCredentials = INKEEP_AGENTS_MANAGE_UI_USERNAME && INKEEP_AGENTS_MANAGE_UI_PASSWORD;

  // Upsert organization - get existing or create new (always happens regardless of auth)
  const orgId = env.TENANT_ID;
  const { created } = await upsertOrganization(runDbClient)({
    organizationId: orgId,
    name: env.TENANT_ID,
    slug: env.TENANT_ID,
    logo: null,
    metadata: null,
  });

  if (created) {
    logger.info({ organizationId: orgId }, 'Created default organization');
  } else {
    logger.info({ organizationId: orgId }, 'Organization already exists');
  }

  if (!hasCredentials || DISABLE_AUTH || !authInstance) {
    logger.info({ hasCredentials: false }, 'Skipping default user creation');
    return;
  }

  try {
    // Upsert user - get existing or create new
    let user = await getUserByEmail(runDbClient)(INKEEP_AGENTS_MANAGE_UI_USERNAME);

    if (user) {
      logger.info(
        { email: INKEEP_AGENTS_MANAGE_UI_USERNAME, userId: user.id },
        'Default user already exists'
      );
    } else {
      logger.info(
        { email: INKEEP_AGENTS_MANAGE_UI_USERNAME },
        'Creating default user with Better Auth...'
      );

      const result = await authInstance.api.signUpEmail({
        body: {
          email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
          password: INKEEP_AGENTS_MANAGE_UI_PASSWORD,
          name: INKEEP_AGENTS_MANAGE_UI_USERNAME.split('@')[0],
        },
      });

      const createdUser = result.user;

      if (!createdUser) {
        throw new Error('signUpEmail returned no user');
      }

      // Refetch user from DB to ensure consistent type
      user = await getUserByEmail(runDbClient)(INKEEP_AGENTS_MANAGE_UI_USERNAME);

      if (!user) {
        throw new Error('User was created but could not be retrieved from database');
      }

      logger.info(
        {
          email: user.email,
          id: user.id,
        },
        'Default user created from INKEEP_AGENTS_MANAGE_UI_USERNAME/INKEEP_AGENTS_MANAGE_UI_PASSWORD'
      );
    }

    await addUserToOrganization(runDbClient)({
      userId: user.id,
      organizationId: orgId,
      role: 'owner',
    });

    logger.info(
      {
        organizationId: orgId,
        organizationSlug: env.TENANT_ID,
        userId: user.id,
        email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
      },
      'Initialization complete - login with these credentials'
    );
  } catch (error) {
    logger.error(
      { error, email: INKEEP_AGENTS_MANAGE_UI_USERNAME },
      'Failed to create default user'
    );
  }
}
