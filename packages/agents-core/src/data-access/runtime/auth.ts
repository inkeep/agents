import { eq } from 'drizzle-orm';
import { member, ssoProvider } from '../../auth/auth-schema';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';

export const getInitialOrganizationForUser =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<{ organizationId: string } | null> => {
    const [result] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(member.createdAt)
      .limit(1);

    return result ?? null;
  };

export const getSSOProviderByProviderId =
  (db: AgentsRunDatabaseClient) =>
  async (providerId: string): Promise<{ id: string } | null> => {
    const [result] = await db
      .select({ id: ssoProvider.id })
      .from(ssoProvider)
      .where(eq(ssoProvider.providerId, providerId))
      .limit(1);

    return result ?? null;
  };

export const createSSOProvider =
  (db: AgentsRunDatabaseClient) =>
  async (data: {
    id: string;
    providerId: string;
    issuer: string;
    domain: string;
    oidcConfig?: string | null;
    samlConfig?: string | null;
    organizationId?: string | null;
  }): Promise<void> => {
    await db.insert(ssoProvider).values({
      id: data.id,
      providerId: data.providerId,
      issuer: data.issuer,
      domain: data.domain,
      oidcConfig: data.oidcConfig ?? null,
      samlConfig: data.samlConfig ?? null,
      userId: null,
      organizationId: data.organizationId ?? null,
    });
  };
