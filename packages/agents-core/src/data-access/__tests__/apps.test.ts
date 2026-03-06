import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import * as runtimeSchema from '../../db/runtime/runtime-schema';
import type { AppInsert } from '../../types/entities';
import { createApp, deleteApp, getAppById, listAppsPaginated, updateApp } from '../runtime/apps';

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

  describe('listAppsPaginated', () => {
    it('should list apps with pagination', async () => {
      await createApp(db)(makeWebClientApp());
      await createApp(db)(makeApiApp());

      const result = await listAppsPaginated(db)({ scopes: { tenantId: TEST_TENANT_ID } });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
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

  describe('updateApp', () => {
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

    it('should update config', async () => {
      await createApp(db)(makeWebClientApp());

      const updated = await updateApp(db)({
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

      expect(updated.config).toEqual({
        type: 'web_client',
        webClient: {
          allowedDomains: ['new.customer.com'],
          captchaEnabled: true,
        },
      });
    });
  });

  describe('deleteApp', () => {
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
});
