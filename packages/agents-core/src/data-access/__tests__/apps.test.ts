import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import * as runtimeSchema from '../../db/runtime/runtime-schema';
import type { AppInsert } from '../../types/entities';
import {
  clearAppDefaultsByAgent,
  clearAppDefaultsByProject,
  createApp,
  deleteApp,
  deleteAppForTenant,
  deleteAppsByProject,
  getAppById,
  getAppByIdForTenant,
  listAppsPaginated,
  updateApp,
  updateAppForTenant,
} from '../runtime/apps';

const TEST_TENANT_ID = 'test-tenant';
const TEST_PROJECT_ID = 'test-project';

const makeWebClientApp = (overrides?: Partial<AppInsert>): AppInsert => ({
  tenantId: TEST_TENANT_ID,
  projectId: TEST_PROJECT_ID,
  id: 'app-web-1',
  name: 'Docs Widget',
  type: 'web_client',
  defaultAgentId: 'agent-1',
  enabled: true,
  config: {
    type: 'web_client',
    webClient: {
      allowedDomains: ['help.customer.com'],
      captchaEnabled: false,
    },
  },
  ...overrides,
});

const makeApiApp = (overrides?: Partial<AppInsert>): AppInsert => ({
  tenantId: TEST_TENANT_ID,
  projectId: TEST_PROJECT_ID,
  id: 'app-api-1',
  name: 'Backend API',
  type: 'api',
  defaultAgentId: 'agent-1',
  enabled: true,
  config: { type: 'api', api: {} },
  ...overrides,
});

describe('apps data access', () => {
  let db: AgentsRunDatabaseClient;
  let pglite: PGlite;

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema: runtimeSchema }) as unknown as AgentsRunDatabaseClient;

    const isInPackageDir = process.cwd().includes('agents-core');
    const migrationsPath = isInPackageDir
      ? './drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(drizzle(pglite), { migrationsFolder: migrationsPath });
  });

  beforeEach(async () => {
    await db.delete(runtimeSchema.apps);
    await db.delete(runtimeSchema.organization);

    await db.insert(runtimeSchema.organization).values({
      id: TEST_TENANT_ID,
      name: 'Test Org',
      slug: 'test-org',
      createdAt: new Date(),
    });
  });

  describe('createApp', () => {
    it('should create a web_client app', async () => {
      const app = await createApp(db)(makeWebClientApp());

      expect(app).toBeDefined();
      expect(app.id).toBe('app-web-1');
      expect(app.type).toBe('web_client');
      expect(app.name).toBe('Docs Widget');
      expect(app.defaultAgentId).toBe('agent-1');
      expect(app.config).toEqual({
        type: 'web_client',
        webClient: {
          allowedDomains: ['help.customer.com'],
          captchaEnabled: false,
        },
      });
    });

    it('should create an api app', async () => {
      const app = await createApp(db)(makeApiApp());

      expect(app).toBeDefined();
      expect(app.type).toBe('api');
    });
  });

  describe('getAppById', () => {
    it('should return the app when it exists', async () => {
      await createApp(db)(makeWebClientApp());

      const app = await getAppById(db)('app-web-1');

      expect(app).toBeDefined();
      expect(app?.id).toBe('app-web-1');
    });

    it('should return undefined when app does not exist', async () => {
      const app = await getAppById(db)('nonexistent');

      expect(app).toBeUndefined();
    });
  });

  describe('getAppByIdForTenant', () => {
    it('should return the app when it belongs to the tenant', async () => {
      await createApp(db)(makeWebClientApp());

      const app = await getAppByIdForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'app-web-1',
      });

      expect(app).toBeDefined();
      expect(app?.id).toBe('app-web-1');
    });

    it('should return undefined when app belongs to a different tenant', async () => {
      await createApp(db)(makeWebClientApp());

      const app = await getAppByIdForTenant(db)({
        scopes: { tenantId: 'other-tenant' },
        id: 'app-web-1',
      });

      expect(app).toBeUndefined();
    });

    it('should return undefined when app does not exist', async () => {
      const app = await getAppByIdForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'nonexistent',
      });

      expect(app).toBeUndefined();
    });
  });

  describe('listAppsPaginated', () => {
    it('should list apps with pagination', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp());

      const result = await listAppsPaginated(db)({ scopes: { tenantId: TEST_TENANT_ID } });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('should filter by projectId when provided', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp({ projectId: 'other-project', id: 'app-api-other' }));

      const result = await listAppsPaginated(db)({
        scopes: { tenantId: TEST_TENANT_ID, projectId: TEST_PROJECT_ID },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('app-web-1');
    });

    it('should not return apps from other tenants', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp({ tenantId: 'other-tenant', id: 'app-other' }));

      const result = await listAppsPaginated(db)({
        scopes: { tenantId: TEST_TENANT_ID },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('app-web-1');
    });

    it('should filter by type', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp());

      const result = await listAppsPaginated(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        type: 'web_client',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('web_client');
    });

    it('should respect pagination limits', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp());

      const result = await listAppsPaginated(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        pagination: { page: 1, limit: 1 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.pages).toBe(2);
    });
  });

  describe('updateAppForTenant', () => {
    it('should update app fields when tenant matches', async () => {
      await createApp(db)(makeWebClientApp());

      const updated = await updateAppForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'app-web-1',
        data: { name: 'Updated Widget', enabled: false },
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Widget');
      expect(updated?.enabled).toBe(false);
    });

    it('should return undefined when tenant does not match', async () => {
      await createApp(db)(makeWebClientApp());

      const updated = await updateAppForTenant(db)({
        scopes: { tenantId: 'other-tenant' },
        id: 'app-web-1',
        data: { name: 'Should Not Work' },
      });

      expect(updated).toBeUndefined();

      const unchanged = await getAppById(db)('app-web-1');
      expect(unchanged?.name).toBe('Docs Widget');
    });

    it('should update config', async () => {
      await createApp(db)(makeWebClientApp());

      const updated = await updateAppForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'app-web-1',
        data: {
          config: {
            type: 'web_client',
            webClient: {
              allowedDomains: ['new.customer.com'],
              captchaEnabled: true,
            },
          },
        },
      });

      expect(updated?.config).toEqual({
        type: 'web_client',
        webClient: {
          allowedDomains: ['new.customer.com'],
          captchaEnabled: true,
        },
      });
    });
  });

  describe('deleteAppForTenant', () => {
    it('should delete app when tenant matches', async () => {
      await createApp(db)(makeWebClientApp());

      const deleted = await deleteAppForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'app-web-1',
      });

      expect(deleted).toBe(true);

      const app = await getAppById(db)('app-web-1');
      expect(app).toBeUndefined();
    });

    it('should return false when tenant does not match', async () => {
      await createApp(db)(makeWebClientApp());

      const deleted = await deleteAppForTenant(db)({
        scopes: { tenantId: 'other-tenant' },
        id: 'app-web-1',
      });

      expect(deleted).toBe(false);

      const app = await getAppById(db)('app-web-1');
      expect(app).toBeDefined();
    });

    it('should return false for nonexistent app', async () => {
      const deleted = await deleteAppForTenant(db)({
        scopes: { tenantId: TEST_TENANT_ID },
        id: 'nonexistent',
      });

      expect(deleted).toBe(false);
    });
  });

  describe('updateApp (unscoped)', () => {
    it('should update app fields', async () => {
      await createApp(db)(makeWebClientApp());

      const updated = await updateApp(db)({
        id: 'app-web-1',
        data: { name: 'Updated Widget', enabled: false },
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated Widget');
      expect(updated.enabled).toBe(false);
    });
  });

  describe('deleteApp (unscoped)', () => {
    it('should delete existing app', async () => {
      await createApp(db)(makeWebClientApp());

      const deleted = await deleteApp(db)('app-web-1');

      expect(deleted).toBe(true);

      const app = await getAppById(db)('app-web-1');
      expect(app).toBeUndefined();
    });

    it('should return false for nonexistent app', async () => {
      const deleted = await deleteApp(db)('nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('deleteAppsByProject', () => {
    it('should delete apps with matching projectId and leave others untouched', async () => {
      await createApp(db)(makeWebClientApp({ id: 'app-1', projectId: 'proj-1' }));
      await createApp(db)(makeWebClientApp({ id: 'app-2', projectId: 'proj-1' }));
      await createApp(db)(makeWebClientApp({ id: 'app-3', projectId: 'proj-2' }));

      const count = await deleteAppsByProject(db)(TEST_TENANT_ID, 'proj-1');

      expect(count).toBe(2);
      expect(await getAppById(db)('app-1')).toBeUndefined();
      expect(await getAppById(db)('app-2')).toBeUndefined();
      expect(await getAppById(db)('app-3')).toBeDefined();
    });

    it('should return 0 when no apps match', async () => {
      await createApp(db)(makeWebClientApp({ id: 'app-1', projectId: 'proj-1' }));

      const count = await deleteAppsByProject(db)(TEST_TENANT_ID, 'nonexistent');

      expect(count).toBe(0);
      expect(await getAppById(db)('app-1')).toBeDefined();
    });

    it('should not delete apps from other tenants', async () => {
      await createApp(db)(makeWebClientApp({ id: 'app-1', projectId: 'proj-1' }));

      const count = await deleteAppsByProject(db)('other-tenant', 'proj-1');

      expect(count).toBe(0);
      expect(await getAppById(db)('app-1')).toBeDefined();
    });
  });

  describe('clearAppDefaultsByProject', () => {
    it('should null defaultProjectId and defaultAgentId on matching apps', async () => {
      await createApp(db)(
        makeWebClientApp({
          id: 'app-1',
          projectId: 'proj-owner',
          defaultProjectId: 'proj-1',
          defaultAgentId: 'agent-1',
        })
      );

      const count = await clearAppDefaultsByProject(db)(TEST_TENANT_ID, 'proj-1');

      expect(count).toBe(1);
      const app = await getAppById(db)('app-1');
      expect(app?.defaultProjectId).toBeNull();
      expect(app?.defaultAgentId).toBeNull();
      expect(app?.projectId).toBe('proj-owner');
      expect(app?.name).toBe('Docs Widget');
    });

    it('should not affect apps with non-matching defaultProjectId', async () => {
      await createApp(db)(
        makeWebClientApp({
          id: 'app-1',
          defaultProjectId: 'proj-2',
          defaultAgentId: 'agent-1',
        })
      );

      const count = await clearAppDefaultsByProject(db)(TEST_TENANT_ID, 'proj-1');

      expect(count).toBe(0);
      const app = await getAppById(db)('app-1');
      expect(app?.defaultProjectId).toBe('proj-2');
      expect(app?.defaultAgentId).toBe('agent-1');
    });
  });

  describe('clearAppDefaultsByAgent', () => {
    it('should null only defaultAgentId on matching apps', async () => {
      await createApp(db)(
        makeWebClientApp({
          id: 'app-1',
          defaultProjectId: 'proj-1',
          defaultAgentId: 'agent-1',
        })
      );

      const count = await clearAppDefaultsByAgent(db)(TEST_TENANT_ID, 'agent-1');

      expect(count).toBe(1);
      const app = await getAppById(db)('app-1');
      expect(app?.defaultAgentId).toBeNull();
      expect(app?.defaultProjectId).toBe('proj-1');
    });

    it('should not affect apps with non-matching defaultAgentId', async () => {
      await createApp(db)(
        makeWebClientApp({
          id: 'app-1',
          defaultAgentId: 'agent-2',
        })
      );

      const count = await clearAppDefaultsByAgent(db)(TEST_TENANT_ID, 'agent-1');

      expect(count).toBe(0);
      const app = await getAppById(db)('app-1');
      expect(app?.defaultAgentId).toBe('agent-2');
    });
  });

  describe('cascade delete ordering', () => {
    it('should delete app with both projectId and defaultProjectId matching', async () => {
      await createApp(db)(
        makeWebClientApp({
          id: 'app-owned',
          projectId: 'proj-1',
          defaultProjectId: 'proj-1',
          defaultAgentId: 'agent-1',
        })
      );
      await createApp(db)(
        makeWebClientApp({
          id: 'app-default-only',
          projectId: 'proj-other',
          defaultProjectId: 'proj-1',
          defaultAgentId: 'agent-2',
        })
      );

      const deleted = await deleteAppsByProject(db)(TEST_TENANT_ID, 'proj-1');
      expect(deleted).toBe(1);

      const cleared = await clearAppDefaultsByProject(db)(TEST_TENANT_ID, 'proj-1');
      expect(cleared).toBe(1);

      expect(await getAppById(db)('app-owned')).toBeUndefined();
      const remaining = await getAppById(db)('app-default-only');
      expect(remaining).toBeDefined();
      expect(remaining?.defaultProjectId).toBeNull();
      expect(remaining?.defaultAgentId).toBeNull();
    });
  });
});
