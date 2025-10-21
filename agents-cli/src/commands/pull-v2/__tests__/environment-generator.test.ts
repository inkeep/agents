import { describe, expect, it } from 'vitest';
import { 
  generateEnvironmentFiles, 
  generateEnvironmentIndex,
  generateEnvironmentFile,
  generateEnvironmentTemplate,
  DEFAULT_CODE_STYLE 
} from '../environment-generator';

describe('environment-generator', () => {
  const sampleCredentials = {
    'openai-api-key': {
      id: 'openai-api-key',
      type: 'api-key',
      description: 'OpenAI API key for GPT models'
    },
    'database-url': {
      id: 'database-url',
      type: 'connection-string',
      description: 'Database connection URL'
    }
  };

  describe('generateEnvironmentFiles', () => {
    it('should generate complete environment files structure', () => {
      const result = generateEnvironmentFiles('development', sampleCredentials);

      expect(result.environmentFileName).toBe('development.env.ts');
      expect(result.indexFile).toContain("import { developmentEnv } from './development.env';");
      expect(result.indexFile).toContain("export default developmentEnv;");
      expect(result.environmentFile).toContain("export const developmentEnv = environment({");
    });

    it('should handle different environment names', () => {
      const result = generateEnvironmentFiles('production', sampleCredentials);

      expect(result.environmentFileName).toBe('production.env.ts');
      expect(result.indexFile).toContain("import { productionEnv } from './production.env';");
      expect(result.environmentFile).toContain("export const productionEnv = environment({");
    });
  });

  describe('generateEnvironmentIndex', () => {
    it('should generate index file for development environment', () => {
      const result = generateEnvironmentIndex('development');

      expect(result).toContain("import { developmentEnv } from './development.env';");
      expect(result).toContain("export default developmentEnv;");
    });

    it('should generate index file for staging environment', () => {
      const result = generateEnvironmentIndex('staging');

      expect(result).toContain("import { stagingEnv } from './staging.env';");
      expect(result).toContain("export default stagingEnv;");
    });

    it('should use double quotes when configured', () => {
      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateEnvironmentIndex('development', style);

      expect(result).toContain('import { developmentEnv } from "./development.env";');
    });
  });

  describe('generateEnvironmentFile', () => {
    it('should generate environment file with credentials', () => {
      const result = generateEnvironmentFile('development', sampleCredentials);

      expect(result).toContain("import { environment } from '@inkeep/agents-sdk';");
      expect(result).toContain("export const developmentEnv = environment({");
      expect(result).toContain("credentials: {");
      expect(result).toContain("'openai-api-key': process.env.OPENAI_API_KEY, // api-key");
      expect(result).toContain("'database-url': process.env.DATABASE_URL, // connection-string");
    });

    it('should generate environment file without credentials', () => {
      const result = generateEnvironmentFile('development', {});

      expect(result).toContain("import { environment } from '@inkeep/agents-sdk';");
      expect(result).toContain("export const developmentEnv = environment({");
      expect(result).toContain("credentials: {}");
      expect(result).not.toContain("process.env.");
    });

    it('should handle credentials without type', () => {
      const credentialsWithoutType = {
        'api-key': {
          id: 'api-key'
        }
      };

      const result = generateEnvironmentFile('development', credentialsWithoutType);

      expect(result).toContain("'api-key': process.env.API_KEY,");
      expect(result).not.toContain("// ");
    });

    it('should convert credential IDs to proper env var names', () => {
      const weirdCredentials = {
        'my-weird-api-key-123': {
          id: 'my-weird-api-key-123',
          type: 'api-key'
        },
        'DATABASE_CONNECTION': {
          id: 'DATABASE_CONNECTION',
          type: 'connection'
        },
        'special--chars__test': {
          id: 'special--chars__test',
          type: 'test'
        }
      };

      const result = generateEnvironmentFile('development', weirdCredentials);

      expect(result).toContain("process.env.MY_WEIRD_API_KEY_123");
      expect(result).toContain("process.env.DATABASE_CONNECTION");
      expect(result).toContain("process.env.SPECIAL_CHARS_TEST");
    });

    it('should use double quotes when configured', () => {
      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateEnvironmentFile('development', sampleCredentials, style);

      expect(result).toContain('import { environment } from "@inkeep/agents-sdk";');
      expect(result).toContain('"openai-api-key": process.env.OPENAI_API_KEY');
    });
  });

  describe('generateEnvironmentTemplate', () => {
    it('should generate .env template with credentials', () => {
      const result = generateEnvironmentTemplate(sampleCredentials);

      expect(result).toContain('# Environment variables for Inkeep Agents');
      expect(result).toContain('# Copy this file to .env and fill in your actual values');
      expect(result).toContain('# API-KEY credentials');
      expect(result).toContain('# openai-api-key - OpenAI API key for GPT models');
      expect(result).toContain('OPENAI_API_KEY=your_openai_api_key_here');
      expect(result).toContain('# CONNECTION-STRING credentials');
      expect(result).toContain('# database-url - Database connection URL');
      expect(result).toContain('DATABASE_URL=your_database_url_here');
    });

    it('should handle empty credentials', () => {
      const result = generateEnvironmentTemplate({});

      expect(result).toContain('# Environment variables for Inkeep Agents');
      expect(result).toContain('# No credentials found in project');
    });

    it('should group credentials by type', () => {
      const mixedCredentials = {
        'openai-key': { id: 'openai-key', type: 'api-key' },
        'anthropic-key': { id: 'anthropic-key', type: 'api-key' },
        'db-url': { id: 'db-url', type: 'database' },
        'redis-url': { id: 'redis-url', type: 'database' }
      };

      const result = generateEnvironmentTemplate(mixedCredentials);

      expect(result).toContain('# API-KEY credentials');
      expect(result).toContain('OPENAI_KEY=');
      expect(result).toContain('ANTHROPIC_KEY=');
      expect(result).toContain('# DATABASE credentials');
      expect(result).toContain('DB_URL=');
      expect(result).toContain('REDIS_URL=');
    });

    it('should handle credentials without descriptions', () => {
      const credentialsNoDesc = {
        'simple-key': { id: 'simple-key', type: 'api-key' }
      };

      const result = generateEnvironmentTemplate(credentialsNoDesc);

      expect(result).toContain('# simple-key');
      expect(result).not.toContain(' - ');
      expect(result).toContain('SIMPLE_KEY=your_simple_key_here');
    });
  });
});