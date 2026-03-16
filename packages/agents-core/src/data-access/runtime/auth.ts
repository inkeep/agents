import { and, eq } from 'drizzle-orm';
import * as authSchema from '../../auth/auth-schema';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { generateId } from '../../utils';

export const getInitialOrganization =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<{ id: string } | null> => {
    const [membership] = await db
      .select({ organizationId: authSchema.member.organizationId })
      .from(authSchema.member)
      .where(eq(authSchema.member.userId, userId))
      .orderBy(authSchema.member.createdAt)
      .limit(1);

    return membership ? { id: membership.organizationId } : null;
  };

export const queryHasCredentialAccount =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: authSchema.account.id })
      .from(authSchema.account)
      .where(
        and(eq(authSchema.account.userId, userId), eq(authSchema.account.providerId, 'credential'))
      )
      .limit(1);

    return !!row;
  };

export interface SSOProviderRegistration {
  providerId: string;
  issuer: string;
  domain: string;
  organizationId?: string;
  oidcConfig?: object;
  samlConfig?: object;
}

export const registerSSOProvider =
  (db: AgentsRunDatabaseClient) =>
  async (provider: SSOProviderRegistration): Promise<void> => {
    try {
      const existing = await db
        .select()
        .from(authSchema.ssoProvider)
        .where(eq(authSchema.ssoProvider.providerId, provider.providerId))
        .limit(1);

      if (existing.length > 0) {
        return;
      }

      if (!provider.domain) {
        throw new Error(`SSO provider '${provider.providerId}' must have a domain`);
      }

      await db.insert(authSchema.ssoProvider).values({
        id: generateId(),
        providerId: provider.providerId,
        issuer: provider.issuer,
        domain: provider.domain,
        oidcConfig: provider.oidcConfig ? JSON.stringify(provider.oidcConfig) : null,
        samlConfig: provider.samlConfig ? JSON.stringify(provider.samlConfig) : null,
        userId: null,
        organizationId: provider.organizationId || null,
      });
    } catch (error) {
      console.error(`❌ Failed to register SSO provider '${provider.providerId}':`, error);
    }
  };
