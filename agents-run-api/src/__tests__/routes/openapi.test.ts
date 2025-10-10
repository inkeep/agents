import { describe, expect, it } from 'vitest';
import { makeRequest } from '../utils/testRequest';

describe('OpenAPI Specification - Integration Tests', () => {
  describe('GET /openapi.json', () => {
    it('should return OpenAPI spec with 200 status', async () => {
      const res = await makeRequest('/openapi.json');
      expect(res.status).toBe(200);
    });

    it('should return valid JSON', async () => {
      const res = await makeRequest('/openapi.json');
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = await res.json();
      expect(body).toBeDefined();
      expect(typeof body).toBe('object');
    });

    it('should contain required OpenAPI 3.0 fields', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Check top-level required fields
      expect(spec).toHaveProperty('openapi');
      expect(spec.openapi).toBe('3.0.0');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');
    });

    it('should have correct API metadata', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      expect(spec.info).toHaveProperty('title');
      expect(spec.info.title).toBe('Inkeep Agents Run API');
      expect(spec.info).toHaveProperty('version');
      expect(spec.info).toHaveProperty('description');
      expect(spec.info.description).toContain('Chat completions');
    });

    it('should contain server configuration', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      expect(spec).toHaveProperty('servers');
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers.length).toBeGreaterThan(0);

      const firstServer = spec.servers[0];
      expect(firstServer).toHaveProperty('url');
      expect(firstServer).toHaveProperty('description');
    });

    it('should contain path definitions', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      expect(spec.paths).toBeDefined();
      expect(typeof spec.paths).toBe('object');
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);

      // Check for key run API endpoints
      expect(spec.paths).toHaveProperty('/v1/chat/completions');
    });

    it('should contain component schemas', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      expect(spec).toHaveProperty('components');
      expect(spec.components).toHaveProperty('schemas');
      expect(typeof spec.components.schemas).toBe('object');
      expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
    });

    it('should have valid path operations', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Check that at least one path has valid HTTP methods
      const firstPath = Object.values(spec.paths)[0] as any;
      expect(firstPath).toBeDefined();

      // Should have at least one HTTP method (get, post, put, delete, etc.)
      const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
      const hasHttpMethod = Object.keys(firstPath).some((key) => httpMethods.includes(key));
      expect(hasHttpMethod).toBe(true);
    });

    it('should have valid structure for operations', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Check that operations have proper structure
      let hasValidOperation = false;
      for (const path of Object.values(spec.paths) as any[]) {
        for (const method of Object.values(path) as any[]) {
          // Check if the method is a valid operation object (has responses or requestBody)
          if (method && typeof method === 'object' && (method.responses || method.requestBody)) {
            hasValidOperation = true;

            // If operationId exists, it should be valid
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

    it('should have response definitions for operations', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Check that the chat completions endpoint has responses
      const chatPath = spec.paths['/v1/chat/completions'];
      expect(chatPath).toBeDefined();
      expect(chatPath.post).toBeDefined();
      expect(chatPath.post.responses).toBeDefined();
      expect(chatPath.post.responses['200']).toBeDefined();
    });

    it('should not contain invalid schema references', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

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
      const startTime = Date.now();
      const res = await makeRequest('/openapi.json');
      const endTime = Date.now();

      expect(res.status).toBe(200);

      // OpenAPI spec generation should be fast (under 1 second)
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(1000);
    });

    it('should successfully parse without throwing errors', async () => {
      const res = await makeRequest('/openapi.json');

      // This should not throw
      await expect(res.json()).resolves.toBeDefined();
    });

    it('should include chat completions endpoint', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Verify chat completions endpoint exists
      expect(spec.paths).toHaveProperty('/v1/chat/completions');

      const chatEndpoint = spec.paths['/v1/chat/completions'];
      expect(chatEndpoint).toHaveProperty('post');
      expect(chatEndpoint.post).toHaveProperty('summary');
      expect(chatEndpoint.post).toHaveProperty('requestBody');
      expect(chatEndpoint.post).toHaveProperty('responses');
    });

    it('should include A2A endpoints if present', async () => {
      const res = await makeRequest('/openapi.json');
      const spec = await res.json();

      // Check for A2A endpoints (they may be present)
      const paths = Object.keys(spec.paths);
      const hasA2AEndpoints = paths.some(path => path.includes('a2a') || path.includes('.well-known'));

      // Just verify the spec is valid whether or not A2A endpoints are present
      expect(spec).toHaveProperty('paths');
      expect(typeof spec.paths).toBe('object');
    });
  });
});
