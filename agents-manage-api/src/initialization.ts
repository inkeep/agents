import {
  generateId,
  getUserByEmail,
  member as memberTable,
  organization as orgTable,
} from '@inkeep/agents-core';
import { and, eq } from 'drizzle-orm';
import dbClient from './data/db/dbClient';
import { env } from './env';
import { auth } from './index';
import { getLogger } from './logger';

const logger = getLogger('initialization');

export async function initializeDefaultUser() {
  const { INKEEP_AGENTS_MANAGE_UI_USERNAME, INKEEP_AGENTS_MANAGE_UI_PASSWORD, DISABLE_AUTH } = env;
  const hasCredentials = INKEEP_AGENTS_MANAGE_UI_USERNAME && INKEEP_AGENTS_MANAGE_UI_PASSWORD;

  // Upsert organization - get existing or create new (always happens regardless of auth)
  const orgId = env.TENANT_ID;
  const existingOrg = await dbClient
    .select()
    .from(orgTable)
    .where(eq(orgTable.id, orgId))
    .limit(1);

  if (existingOrg.length === 0) {
    await dbClient.insert(orgTable).values({
      id: orgId,
      name: env.TENANT_ID,
      slug: env.TENANT_ID,
      createdAt: new Date(),
      logo: null,
      metadata: null,
    });
    logger.info({ organizationId: orgId }, 'Created default organization');
  } else {
    logger.info({ organizationId: orgId }, 'Organization already exists');
  }

  if (!hasCredentials || DISABLE_AUTH || !auth) {
    logger.info(
      { hasCredentials: false },
      'Skipping default user creation'
    );
    return;
  }

  try {
    // Upsert user - get existing or create new
    let user = await getUserByEmail(dbClient)(INKEEP_AGENTS_MANAGE_UI_USERNAME);

    if (user) {
      logger.info({ email: INKEEP_AGENTS_MANAGE_UI_USERNAME, userId: user.id }, 'Default user already exists');
    } else {
      logger.info({ email: INKEEP_AGENTS_MANAGE_UI_USERNAME }, 'Creating default user with Better Auth...');

      const result = await auth.api.signUpEmail({
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
      user = await getUserByEmail(dbClient)(INKEEP_AGENTS_MANAGE_UI_USERNAME);

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

    // Ensure user is a member with owner role
    const existingMembership = await dbClient
      .select()
      .from(memberTable)
      .where(
        and(
          eq(memberTable.userId, user.id),
          eq(memberTable.organizationId, orgId)
        )
      )
      .limit(1);

    if (existingMembership.length === 0) {
      await dbClient.insert(memberTable).values({
        id: generateId(),
        userId: user.id,
        organizationId: orgId,
        role: 'owner',
        createdAt: new Date(),
      });
      logger.info({ userId: user.id, organizationId: orgId }, 'Added user as organization owner');
    } else {
      logger.info({ userId: user.id, organizationId: orgId }, 'User already a member of organization');
    }

    logger.info(
      {
        organizationId: orgId,
        organizationSlug: env.TENANT_ID,
        userId: user.id,
        email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
      },
      '✅ Initialization complete - login with these credentials'
    );
  } catch (error) {
    logger.error({ error, email: INKEEP_AGENTS_MANAGE_UI_USERNAME }, '❌ Failed to create default user');
  }
}
