import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeRequest } from './utils/testRequest';

function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = sortObjectKeys(obj[key]);
        return acc;
      },
      {} as Record<string, any>
    );
}

describe('OpenAPI Specification - Integration Tests (Unified agents-api)', () => {
  describe('GET /openapi.json', () => {
    let cachedSpec: any;
    let cachedResponse: Response;

    beforeAll(async () => {
      cachedResponse = await makeRequest('/openapi.json');
      cachedSpec = await cachedResponse.clone().json();
    });

    it('should return OpenAPI spec with 200 status', async () => {
      expect(cachedResponse.status).toBe(200);
    });

    it('should return valid JSON', async () => {
      expect(cachedResponse.headers.get('content-type')).toContain('application/json');
      expect(cachedSpec).toBeDefined();
      expect(typeof cachedSpec).toBe('object');
    });

    it('should contain required OpenAPI fields', async () => {
      expect(cachedSpec).toHaveProperty('openapi');
      expect(cachedSpec.openapi).toBe('3.1.0');
      expect(cachedSpec).toHaveProperty('info');
      expect(cachedSpec).toHaveProperty('paths');
    });

    it('should have correct API metadata', async () => {
      expect(cachedSpec.info).toHaveProperty('title');
      expect(cachedSpec.info.title).toBe('Inkeep Agents API');
      expect(cachedSpec.info).toHaveProperty('version');
      expect(cachedSpec.info).toHaveProperty('description');
    });

    it('should contain server configuration', async () => {
      expect(cachedSpec).toHaveProperty('servers');
      expect(Array.isArray(cachedSpec.servers)).toBe(true);
      expect(cachedSpec.servers.length).toBeGreaterThan(0);
      const firstServer = cachedSpec.servers[0];
      expect(firstServer).toHaveProperty('url');
      expect(firstServer).toHaveProperty('description');
    });

    it('should include both run and manage routes in the unified spec', async () => {
      const paths = Object.keys(cachedSpec.paths || {});

      // Run API
      expect(cachedSpec.paths).toHaveProperty('/run/v1/chat/completions');

      // Manage API is mounted under /manage in the unified app
      const hasManageTenantPaths = paths.some((p) => p.startsWith('/manage/tenants/'));
      expect(hasManageTenantPaths).toBe(true);
    });

    it('should contain component schemas', async () => {
      expect(cachedSpec).toHaveProperty('components');
      expect(cachedSpec.components).toHaveProperty('schemas');
      expect(typeof cachedSpec.components.schemas).toBe('object');
      expect(Object.keys(cachedSpec.components.schemas).length).toBeGreaterThan(0);
    });

    it('should have valid path operations', async () => {
      const firstPath = Object.values(cachedSpec.paths)[0] as any;
      expect(firstPath).toBeDefined();
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
      const hasHttpMethod = Object.keys(firstPath).some((key) => httpMethods.includes(key));
      expect(hasHttpMethod).toBe(true);
    });

    it('should have valid structure for operations', async () => {
      let hasValidOperation = false;
      for (const path of Object.values(cachedSpec.paths) as any[]) {
        for (const method of Object.values(path) as any[]) {
          if (method && typeof method === 'object' && (method.responses || method.requestBody)) {
            hasValidOperation = true;
            if (method.operationId) {
              expect(typeof method.operationId).toBe('string');
              expect(method.operationId.length).toBeGreaterThan(0);
            }
            break;
          }
        }
        if (hasValidOperation) break;
      }
      expect(hasValidOperation).toBe(true);
    });

    it('should have response definitions for run chat completions', async () => {
      const chatPath = cachedSpec.paths['/run/v1/chat/completions'];
      expect(chatPath).toBeDefined();
      expect(chatPath.post).toBeDefined();
      expect(chatPath.post.responses).toBeDefined();
      expect(chatPath.post.responses['200']).toBeDefined();
    });

    it('should not contain invalid schema references', async () => {
      const validateRefs = (obj: any) => {
        if (typeof obj !== 'object' || obj === null) return;

        if (obj.$ref) {
          expect(obj.$ref).toMatch(/^#\/components\/(schemas|parameters)/);
        }

        for (const value of Object.values(obj)) {
          validateRefs(value);
        }
      };

      validateRefs(cachedSpec);
    });

    it('should match the OpenAPI snapshot', async () => {
      const snapshotDir = path.resolve(__dirname, '../../__snapshots__');
      const snapshotPath = path.resolve(snapshotDir, 'openapi.json');

      const normalizedSpec = sortObjectKeys({
        ...cachedSpec,
        servers: [{ url: 'http://localhost:3002', description: 'API Server' }],
      });

      if (process.env.UPDATE_OPENAPI_SNAPSHOT === 'true') {
        if (!fs.existsSync(snapshotDir)) {
          fs.mkdirSync(snapshotDir, { recursive: true });
        }
        fs.writeFileSync(snapshotPath, JSON.stringify(normalizedSpec, null, 2) + '\n', 'utf-8');
        return;
      }

      if (!fs.existsSync(snapshotPath)) {
        const lines: string[] = [];
        lines.push('');
        lines.push('═'.repeat(70));
        lines.push('  ❌ OpenAPI SNAPSHOT NOT FOUND');
        lines.push('═'.repeat(70));
        lines.push('');
        lines.push('  Snapshot file does not exist at:');
        lines.push(`  ${snapshotPath}`);
        lines.push('');
        lines.push('  To create the initial snapshot, run:');
        lines.push('  pnpm --filter @inkeep/agents-api openapi:update-snapshot');
        lines.push('');
        lines.push('═'.repeat(70));
        lines.push('');
        throw new Error(lines.join('\n'));
      }

      const snapshotContent = fs.readFileSync(snapshotPath, 'utf-8');
      const snapshotSpec = JSON.parse(snapshotContent);
      const normalizedSnapshot = sortObjectKeys(snapshotSpec);

      const currentJson = JSON.stringify(normalizedSpec, null, 2);
      const snapshotJson = JSON.stringify(normalizedSnapshot, null, 2);

      if (currentJson !== snapshotJson) {
        const currentPaths = Object.keys(normalizedSpec.paths || {});
        const snapshotPaths = Object.keys(normalizedSnapshot.paths || {});
        const addedPaths = currentPaths.filter((p) => !snapshotPaths.includes(p));
        const removedPaths = snapshotPaths.filter((p) => !currentPaths.includes(p));

        const currentSchemas = Object.keys(normalizedSpec.components?.schemas || {});
        const snapshotSchemas = Object.keys(normalizedSnapshot.components?.schemas || {});
        const addedSchemas = currentSchemas.filter((s) => !snapshotSchemas.includes(s));
        const removedSchemas = snapshotSchemas.filter((s) => !currentSchemas.includes(s));

        const lines: string[] = [];
        lines.push('');
        lines.push('═'.repeat(70));
        lines.push('  ❌ OpenAPI SNAPSHOT MISMATCH');
        lines.push('═'.repeat(70));
        lines.push('');
        lines.push('  The generated OpenAPI spec differs from the committed snapshot.');
        lines.push('');

        if (addedPaths.length > 0 || removedPaths.length > 0) {
          lines.push('  📍 PATH CHANGES:');
          addedPaths.forEach((p) => lines.push(`     + ${p}`));
          removedPaths.forEach((p) => lines.push(`     - ${p}`));
          lines.push('');
        }

        if (addedSchemas.length > 0 || removedSchemas.length > 0) {
          lines.push('  📦 SCHEMA CHANGES:');
          addedSchemas.forEach((s) => lines.push(`     + ${s}`));
          removedSchemas.forEach((s) => lines.push(`     - ${s}`));
          lines.push('');
        }

        if (
          addedPaths.length === 0 &&
          removedPaths.length === 0 &&
          addedSchemas.length === 0 &&
          removedSchemas.length === 0
        ) {
          lines.push('  ⚠️  Changes detected in existing paths/schemas (not additions or removals)');
          lines.push('');
        }

        lines.push('  ─'.repeat(35));
        lines.push('');
        lines.push('  ┌─────────────────────────────────────────────────────────────────┐');
        lines.push('  │  TO UPDATE THE SNAPSHOT, RUN:                                   │');
        lines.push('  │                                                                 │');
        lines.push('  │  pnpm --filter @inkeep/agents-api openapi:update-snapshot       │');
        lines.push('  └─────────────────────────────────────────────────────────────────┘');
        lines.push('');
        lines.push('═'.repeat(70));
        lines.push('');

        throw new Error(lines.join('\n'));
      }
    });
  });
});


