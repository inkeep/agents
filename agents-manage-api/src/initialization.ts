import {
  generateId,
  getUserByEmail,
  member as memberTable,
  organization as orgTable,
} from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';
import { and, eq } from 'drizzle-orm';
import dbClient from './data/db/dbClient';
import { env } from './env';

export async function initializeDefaultUser(auth: ReturnType<typeof createAuth> | null) {
  const { INKEEP_AGENTS_MANAGE_UI_USERNAME, INKEEP_AGENTS_MANAGE_UI_PASSWORD, DISABLE_AUTH } = env;
  const hasCredentials = INKEEP_AGENTS_MANAGE_UI_USERNAME && INKEEP_AGENTS_MANAGE_UI_PASSWORD;

  // Upsert organization - get existing or create new (always happens regardless of auth)
  const orgId = env.TENANT_ID;
  const existingOrg = await dbClient.select().from(orgTable).where(eq(orgTable.id, orgId)).limit(1);

  if (existingOrg.length === 0) {
    await dbClient.insert(orgTable).values({
      id: orgId,
      name: env.TENANT_ID,
      slug: env.TENANT_ID,
      createdAt: new Date(),
      logo: null,
      metadata: null,
    });
    console.log('Created default organization:', { organizationId: orgId });
  } else {
    console.log('Organization already exists:', { organizationId: orgId });
  }

  if (!hasCredentials || DISABLE_AUTH || !auth) {
    console.log('Skipping default user creation:', { hasCredentials: false });
    return;
  }

  try {
    // Upsert user - get existing or create new
    let user = await getUserByEmail(dbClient)(INKEEP_AGENTS_MANAGE_UI_USERNAME);

    if (user) {
      console.log('Default user already exists:', {
        email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
        userId: user.id,
      });
    } else {
      console.log('Creating default user with Better Auth...', {
        email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
      });

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

      console.log(
        'Default user created from INKEEP_AGENTS_MANAGE_UI_USERNAME/INKEEP_AGENTS_MANAGE_UI_PASSWORD:',
        {
          email: user.email,
          id: user.id,
        }
      );
    }

    // Ensure user is a member with owner role
    const existingMembership = await dbClient
      .select()
      .from(memberTable)
      .where(and(eq(memberTable.userId, user.id), eq(memberTable.organizationId, orgId)))
      .limit(1);

    if (existingMembership.length === 0) {
      await dbClient.insert(memberTable).values({
        id: generateId(),
        userId: user.id,
        organizationId: orgId,
        role: 'owner',
        createdAt: new Date(),
      });
      console.log('Added user as organization owner:', { userId: user.id, organizationId: orgId });
    } else {
      console.log('User already a member of organization:', {
        userId: user.id,
        organizationId: orgId,
      });
    }

    console.log('✅ Initialization complete - login with these credentials:', {
      organizationId: orgId,
      organizationSlug: env.TENANT_ID,
      userId: user.id,
      email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
    });
  } catch (error) {
    console.error('❌ Failed to create default user:', {
      error,
      email: INKEEP_AGENTS_MANAGE_UI_USERNAME,
    });
  }
}
