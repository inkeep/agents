import { describe, expect, it } from 'vitest';

describe('Init Command Utilities', () => {
  describe('sanitizeProjectName', () => {
    function sanitizeProjectName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    it('should convert to lowercase', () => {
      expect(sanitizeProjectName('MyProject')).toBe('myproject');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeProjectName('My Project Name')).toBe('my-project-name');
    });

    it('should replace special characters with hyphens', () => {
      expect(sanitizeProjectName('project@name!123')).toBe('project-name-123');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeProjectName('my---project')).toBe('my-project');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeProjectName('-project-')).toBe('project');
    });

    it('should handle underscores', () => {
      expect(sanitizeProjectName('my_project')).toBe('my_project');
    });
  });

  describe('config file generation', () => {
    function generateConfigFile(tenantId: string, projectId: string): string {
      return `import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: '${tenantId}',
  projectId: '${projectId}',
  agentsManageApi: {
    url: 'https://manage-api.inkeep.com',
  },
  agentsRunApi: {
    url: 'https://run-api.inkeep.com',
  },
});
`;
    }

    it('should generate config with tenant and project ID', () => {
      const config = generateConfigFile('tenant-123', 'project-456');

      expect(config).toContain("tenantId: 'tenant-123'");
      expect(config).toContain("projectId: 'project-456'");
      expect(config).toContain('https://manage-api.inkeep.com');
      expect(config).toContain('https://run-api.inkeep.com');
    });
  });

  describe('env template generation', () => {
    function generateEnvTemplate(environment: string): string {
      return `# ${environment.charAt(0).toUpperCase() + environment.slice(1)} Environment
# Add your API keys and secrets here

# OpenAI API Key
OPENAI_API_KEY=sk-your-key-here

# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Add other provider keys as needed
`;
    }

    it('should generate development env template', () => {
      const env = generateEnvTemplate('development');

      expect(env).toContain('# Development Environment');
      expect(env).toContain('OPENAI_API_KEY');
      expect(env).toContain('ANTHROPIC_API_KEY');
    });

    it('should generate production env template', () => {
      const env = generateEnvTemplate('production');

      expect(env).toContain('# Production Environment');
    });
  });
});
