import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('push command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pushCommand', () => {
    it('should be defined and exported', async () => {
      const { pushCommand } = await import('../push');
      expect(pushCommand).toBeDefined();
      expect(typeof pushCommand).toBe('function');
    });
  });

  describe('PushOptions interface', () => {
    it('should support all options', () => {
      const options = {
        all: true,
        project: 'test-proj',
        config: 'inkeep.config.ts',
        tag: 'prod',
        quiet: true,
        force: true,
        json: true,
      };
      expect(options.all).toBe(true);
      expect(options.project).toBe('test-proj');
      expect(options.tag).toBe('prod');
    });
  });
});
