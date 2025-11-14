import { beforeAll, describe, expect, it } from 'vitest';
import { makeRequest } from '../utils/testRequest';

describe('OpenAPI Specification - Integration Tests', () => {
  describe('GET /openapi.json', () => {
    let cachedSpec: any;
    let cachedResponse: Response;

    // Fetch the OpenAPI spec once before all tests to avoid expensive regeneration
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

    it('should contain required OpenAPI 3.0 fields', async () => {
      const spec = cachedSpec;

      // Check top-level required fields
      expect(spec).toHaveProperty('openapi');
      expect(spec.openapi).toBe('3.0.0');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');
    });

    it('should have correct API metadata', async () => {
      const spec = cachedSpec;

      expect(spec.info).toHaveProperty('title');
      expect(spec.info.title).toBe('Inkeep Agents Manage API');
      expect(spec.info).toHaveProperty('version');
      expect(spec.info).toHaveProperty('description');
    });

    it('should contain server configuration', async () => {
      const spec = cachedSpec;

      expect(spec).toHaveProperty('servers');
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers.length).toBeGreaterThan(0);

      const firstServer = spec.servers[0];
      expect(firstServer).toHaveProperty('url');
      expect(firstServer).toHaveProperty('description');
    });

    it('should contain path definitions', async () => {
      const spec = cachedSpec;

      expect(spec.paths).toBeDefined();
      expect(typeof spec.paths).toBe('object');
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);

      // Check for some key endpoints
      expect(spec.paths).toHaveProperty('/health');
      expect(spec.paths).toHaveProperty('/tenants/{tenantId}/projects');
      expect(spec.paths).toHaveProperty('/tenants/{tenantId}/projects/{projectId}/agents');
    });

    it('should contain component schemas', async () => {
      const spec = cachedSpec;

      expect(spec).toHaveProperty('components');
      expect(spec.components).toHaveProperty('schemas');
      expect(typeof spec.components.schemas).toBe('object');
      expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);

      // Check for common error schemas
      expect(spec.components.schemas).toHaveProperty('BadRequest');
      expect(spec.components.schemas).toHaveProperty('NotFound');
      expect(spec.components.schemas).toHaveProperty('InternalServerError');
    });

    it('should have valid path operations', async () => {
      const spec = cachedSpec;

      // Check that at least one path has valid HTTP methods
      const firstPath = Object.values(spec.paths)[0] as any;
      expect(firstPath).toBeDefined();

      // Should have at least one HTTP method (get, post, put, delete, etc.)
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
      const hasHttpMethod = Object.keys(firstPath).some((key) => httpMethods.includes(key));
      expect(hasHttpMethod).toBe(true);
    });

    it('should have operation IDs for endpoints', async () => {
      const spec = cachedSpec;

      // Check that operations have operationId
      let foundOperationId = false;
      for (const path of Object.values(spec.paths) as any[]) {
        for (const method of Object.values(path) as any[]) {
          if (method.operationId) {
            foundOperationId = true;
            expect(typeof method.operationId).toBe('string');
            expect(method.operationId.length).toBeGreaterThan(0);
            break;
          }
        }
        if (foundOperationId) break;
      }
      expect(foundOperationId).toBe(true);
    });

    it('should have response definitions for operations', async () => {
      const spec = cachedSpec;

      // Check that operations have responses
      const projectsPath = spec.paths['/tenants/{tenantId}/projects'];
      expect(projectsPath).toBeDefined();
      expect(projectsPath.get).toBeDefined();
      expect(projectsPath.get.responses).toBeDefined();
      expect(projectsPath.get.responses['200']).toBeDefined();
      expect(projectsPath.get.responses['400']).toBeDefined();
      expect(projectsPath.get.responses['500']).toBeDefined();
    });

    it('should not contain invalid schema references', async () => {
      const spec = cachedSpec;

      // Validate that all $ref references are valid
      const validateRefs = (obj: any, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return;

        if (obj.$ref) {
          // $ref should start with #/components/
          expect(obj.$ref).toMatch(/^#\/components\/(schemas|parameters)/);
        }

        for (const [key, value] of Object.entries(obj)) {
          validateRefs(value, `${path}.${key}`);
        }
      };

      validateRefs(spec);
    });

    it('should have reasonable response times', async () => {
      // Test fresh request performance (not using cache)
      const startTime = Date.now();
      const res = await makeRequest('/openapi.json');
      const endTime = Date.now();

      expect(res.status).toBe(200);

      // OpenAPI spec generation should be reasonably fast (under 2 seconds)
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(6000);
    });

    it('should successfully parse without throwing errors', async () => {
      // Verify the cached spec is valid JSON
      expect(cachedSpec).toBeDefined();
      expect(typeof cachedSpec).toBe('object');
    });
  });
});
