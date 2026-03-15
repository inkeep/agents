import { beforeEach, describe, expect, it } from 'vitest';
import { getCacheEntry, setCacheEntry } from '../../../data-access/runtime/contextCache';
import type { AgentsRunDatabaseClient } from '../../../db/runtime/runtime-client';
import { contextCache, conversations } from '../../../db/runtime/runtime-schema';
import { generateId } from '../../../utils/conversations';
import { testRunDbClient } from '../../setup';

describe('runtime contextCache scoping isolation', () => {
  let db: AgentsRunDatabaseClient;
  const tenantA = 'tenant-a';
  const tenantB = 'tenant-b';
  const projectA = 'project-a';
  const conversationId = 'conv-1';
  const contextConfigId = 'config-1';
  const contextVariableKey = 'var-key';

  beforeEach(async () => {
    db = testRunDbClient;
    await db.delete(contextCache);
    await db.delete(conversations);

    await db.insert(conversations).values({
      id: conversationId,
      tenantId: tenantA,
      projectId: projectA,
      activeSubAgentId: 'sub-1',
    });
  });

  it('getCacheEntry should not return a cache entry belonging to a different tenant', async () => {
    await setCacheEntry(db)({
      id: generateId(),
      tenantId: tenantA,
      projectId: projectA,
      conversationId,
      contextConfigId,
      contextVariableKey,
      ref: { type: 'branch', name: 'main', hash: 'abc' },
      value: { data: 'test' },
      fetchedAt: new Date().toISOString(),
    });

    const wrongTenant = await getCacheEntry(db)({
      conversationId,
      contextConfigId,
      contextVariableKey,
      scopes: { tenantId: tenantB, projectId: projectA },
    });
    expect(wrongTenant).toBeNull();

    const correctTenant = await getCacheEntry(db)({
      conversationId,
      contextConfigId,
      contextVariableKey,
      scopes: { tenantId: tenantA, projectId: projectA },
    });
    expect(correctTenant).not.toBeNull();
    expect(correctTenant?.conversationId).toBe(conversationId);
  });
});
