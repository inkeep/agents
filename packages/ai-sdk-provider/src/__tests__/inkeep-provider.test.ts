import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInkeep } from '../inkeep-provider';

describe('createInkeep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INKEEP_AGENTS_RUN_API_URL;
    delete process.env.INKEEP_API_KEY;
  });

  describe('Provider creation', () => {
    it('should create provider with baseURL', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
      expect(provider.languageModel).toBeDefined();
    });

    it('should create provider with baseURL from environment', () => {
      process.env.INKEEP_AGENTS_RUN_API_URL = 'http://localhost:3003';

      const provider = createInkeep();

      expect(provider).toBeDefined();
    });

    it('should work without baseURL if INKEEP_AGENTS_RUN_API_URL env var is set', () => {
      process.env.INKEEP_AGENTS_RUN_API_URL = 'http://localhost:3003';
      const provider = createInkeep();
      expect(provider).toBeDefined();
    });

    it('should accept optional apiKey', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        apiKey: 'test-key',
      });

      expect(provider).toBeDefined();
    });

    it('should accept optional headers', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        headers: {
          'x-custom-header': 'value',
        },
      });

      expect(provider).toBeDefined();
    });

    it('should accept optional fetch implementation', () => {
      const customFetch = vi.fn();
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        fetch: customFetch,
      });

      expect(provider).toBeDefined();
    });
  });

  describe('Model creation', () => {
    it('should create model via direct call', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      const model = provider('agent-123');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('agent-123');
      expect(model.provider).toBe('inkeep');
    });

    it('should create model via languageModel method', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      const model = provider.languageModel('agent-456');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('agent-456');
    });

    it('should pass model options correctly', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      const model = provider('agent-123', {
        conversationId: 'conv-456',
        headers: { 'user-id': 'user-789' },
      });

      expect(model.options.conversationId).toBe('conv-456');
      expect(model.options.headers).toEqual({ 'user-id': 'user-789' });
    });
  });

  describe('Header configuration', () => {
    it('should not include Authorization header when apiKey is not provided', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      const model = provider('agent-123');
      const headers = model.config.headers();

      expect(headers.Authorization).toBeUndefined();
    });

    it('should include Authorization header when apiKey is provided', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        apiKey: 'test-key',
      });

      const model = provider('agent-123');
      const headers = model.config.headers();

      expect(headers.Authorization).toBe('Bearer test-key');
    });

    it('should merge custom headers with default headers', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        headers: {
          'x-custom-header': 'custom-value',
        },
      });

      const model = provider('agent-123');
      const headers = model.config.headers();

      expect(headers['x-custom-header']).toBe('custom-value');
    });

    it('should allow custom headers to override defaults', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
        apiKey: 'test-key',
        headers: {
          Authorization: 'Bearer custom-key',
        },
      });

      const model = provider('agent-123');
      const headers = model.config.headers();

      expect(headers.Authorization).toBe('Bearer custom-key');
    });
  });

  describe('URL handling', () => {
    it('should remove trailing slash from baseURL', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003/',
      });

      const model = provider('agent-123');

      expect(model.config.baseURL).toBe('http://localhost:3003');
    });

    it('should handle baseURL without trailing slash', () => {
      const provider = createInkeep({
        baseURL: 'http://localhost:3003',
      });

      const model = provider('agent-123');

      expect(model.config.baseURL).toBe('http://localhost:3003');
    });
  });
});
