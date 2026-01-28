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

interface JsonDiff {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: any;
  newValue?: any;
}

function computeJsonDiff(
  oldObj: any,
  newObj: any,
  path = '',
  diffs: JsonDiff[] = [],
  maxDepth = 6
): JsonDiff[] {
  if (maxDepth <= 0) {
    if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
      diffs.push({ path: path || '(root)', type: 'changed', oldValue: '...', newValue: '...' });
    }
    return diffs;
  }

  if (oldObj === newObj) return diffs;
  if (oldObj === null || newObj === null || typeof oldObj !== typeof newObj) {
    diffs.push({ path: path || '(root)', type: 'changed', oldValue: oldObj, newValue: newObj });
    return diffs;
  }

  if (typeof oldObj !== 'object') {
    if (oldObj !== newObj) {
      diffs.push({ path: path || '(root)', type: 'changed', oldValue: oldObj, newValue: newObj });
    }
    return diffs;
  }

  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
      diffs.push({
        path: path || '(root)',
        type: 'changed',
        oldValue: `Array[${oldObj.length}]`,
        newValue: `Array[${newObj.length}]`,
      });
    }
    return diffs;
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    if (!(key in oldObj)) {
      diffs.push({ path: newPath, type: 'added', newValue: summarizeValue(newObj[key]) });
    } else if (!(key in newObj)) {
      diffs.push({ path: newPath, type: 'removed', oldValue: summarizeValue(oldObj[key]) });
    } else {
      computeJsonDiff(oldObj[key], newObj[key], newPath, diffs, maxDepth - 1);
    }
  }

  return diffs;
}

function summarizeValue(val: any): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val.length > 50 ? `"${val.substring(0, 50)}..."` : `"${val}"`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return `Array[${val.length}]`;
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    return keys.length > 3 ? `{${keys.slice(0, 3).join(', ')}, ...}` : `{${keys.join(', ')}}`;
  }
  return String(val);
}

function formatDiffOutput(diffs: JsonDiff[], maxLines = 50): string[] {
  const lines: string[] = [];
  const grouped: Record<string, JsonDiff[]> = {};

  for (const diff of diffs) {
    const topLevel = diff.path.split('.').slice(0, 2).join('.');
    if (!grouped[topLevel]) grouped[topLevel] = [];
    grouped[topLevel].push(diff);
  }

  let lineCount = 0;
  for (const [group, groupDiffs] of Object.entries(grouped)) {
    if (lineCount >= maxLines) {
      lines.push(`     ... and ${diffs.length - lineCount} more changes`);
      break;
    }

    lines.push(`     📁 ${group}`);
    lineCount++;

    for (const diff of groupDiffs.slice(0, 5)) {
      if (lineCount >= maxLines) break;

      const shortPath = diff.path.replace(group, '').replace(/^\./, '') || '(value)';
      if (diff.type === 'added') {
        lines.push(`        + ${shortPath}: ${diff.newValue}`);
      } else if (diff.type === 'removed') {
        lines.push(`        - ${shortPath}: ${diff.oldValue}`);
      } else {
        lines.push(`        ~ ${shortPath}`);
        lines.push(`            was: ${summarizeValue(diff.oldValue)}`);
        lines.push(`            now: ${summarizeValue(diff.newValue)}`);
      }
      lineCount++;
    }

    if (groupDiffs.length > 5) {
      lines.push(`        ... and ${groupDiffs.length - 5} more in this section`);
      lineCount++;
    }

    lines.push('');
    lineCount++;
  }

  return lines;
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
        fs.writeFileSync(snapshotPath, `${JSON.stringify(normalizedSpec, null, 2)}\n`, 'utf-8');
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
          addedPaths.forEach((p) => {
            lines.push(`     + ${p}`);
          });
          removedPaths.forEach((p) => {
            lines.push(`     - ${p}`);
          });
          lines.push('');
        }

        if (addedSchemas.length > 0 || removedSchemas.length > 0) {
          lines.push('  📦 SCHEMA CHANGES:');
          addedSchemas.forEach((s) => {
            lines.push(`     + ${s}`);
          });
          removedSchemas.forEach((s) => {
            lines.push(`     - ${s}`);
          });
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

        const diffs = computeJsonDiff(normalizedSnapshot, normalizedSpec);
        if (diffs.length > 0) {
          lines.push('  📋 DETAILED CHANGES:');
          lines.push('');
          lines.push(...formatDiffOutput(diffs));
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
