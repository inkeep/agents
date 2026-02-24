import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneTemplate, cloneTemplateLocal, getAvailableTemplates } from '../templates';
import { createAgents, defaultMockModelConfigurations, syncTemplateDependencies } from '../utils';

// Create the mock execAsync function that will be used by promisify - hoisted so it's available in mocks
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

// Mock all dependencies
vi.mock('fs-extra');
vi.mock('../templates');
vi.mock('@clack/prompts');
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => ({
    pid: 12345,
    stdio: ['pipe', 'pipe', 'pipe'],
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));
vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => JSON.stringify({ version: '1.2.3' })),
  };
});
vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>();
  return {
    ...actual,
    fileURLToPath: vi.fn(() => '/fake/dist/utils.js'),
  };
});

// Setup default mocks
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn().mockReturnThis(),
  message: vi.fn().mockReturnThis(),
};

const mockEnvExample = [
  'ENVIRONMENT=development',
  'NODE_ENV=development',
  'LOG_LEVEL=info',
  'INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:password@localhost:5432/inkeep_agents',
  'INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://appuser:password@localhost:5433/inkeep_agents',
  'INKEEP_AGENTS_API_URL=http://localhost:3002',
  'PUBLIC_INKEEP_AGENTS_API_URL=http://localhost:3002',
  'TENANT_ID=default',
  'ANTHROPIC_API_KEY=',
  'OPENAI_API_KEY=',
  'GOOGLE_GENERATIVE_AI_API_KEY=',
  'AZURE_API_KEY=',
  'DEFAULT_PROJECT_ID=',
  'NANGO_SECRET_KEY=',
  'NANGO_SERVER_URL=http://localhost:3050',
  'SIGNOZ_URL=http://localhost:3080',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=',
  'INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com',
  'INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12',
  'BETTER_AUTH_SECRET=your-secret-key-change-in-production',
  'SPICEDB_ENDPOINT=localhost:50051',
  'SPICEDB_PRESHARED_KEY=dev-secret-key',
  'INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET=test-bypass-secret-for-ci',
  '# INKEEP_AGENTS_JWT_SIGNING_SECRET=',
  '# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=',
  '# INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=',
].join('\n');

describe('createAgents - Template and Project ID Logic', () => {
  let processExitSpy: any;
  let processChdirSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mockExecAsync to default behavior
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    // Mock process methods
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      // Only throw for exit(0) which is expected behavior in some tests
      // Let exit(1) pass so we can see the actual error
      if (code === 0) {
        throw new Error('process.exit called');
      }
      // Don't actually exit for exit(1) in tests
      return undefined as never;
    });
    processChdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});

    // Setup default mocks for @clack/prompts
    vi.mocked(p.intro).mockImplementation(() => {});
    vi.mocked(p.outro).mockImplementation(() => {});
    vi.mocked(p.cancel).mockImplementation(() => {});
    vi.mocked(p.note).mockImplementation(() => {});
    vi.mocked(p.text).mockResolvedValue('test-dir');
    vi.mocked(p.password).mockResolvedValue('test-api-key');
    vi.mocked(p.select).mockResolvedValue('dual');
    vi.mocked(p.confirm).mockResolvedValue(false as any);
    vi.mocked(p.spinner).mockReturnValue(mockSpinner);
    vi.mocked(p.isCancel).mockReturnValue(false);

    // Mock fs-extra
    vi.mocked(fs.pathExists).mockResolvedValue(false as any);
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);
    vi.mocked(fs.readJson).mockResolvedValue({});
    vi.mocked(fs.readFile).mockResolvedValue(mockEnvExample as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.remove).mockResolvedValue(undefined);

    // Mock templates
    vi.mocked(getAvailableTemplates).mockResolvedValue([
      'event-planner',
      'chatbot',
      'data-analysis',
    ]);
    vi.mocked(cloneTemplate).mockResolvedValue(undefined);
    vi.mocked(cloneTemplateLocal).mockResolvedValue(undefined);
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    processChdirSpy.mockRestore();
  });

  describe('Default behavior (no template or customProjectId)', () => {
    it('should use activies-planner as default template and project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should clone base template and activities-planner template
      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/create-agents-template',
        expect.any(String),
        undefined
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/activities-planner',
        'src/projects/activities-planner',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );

      // Should not call getAvailableTemplates since no template validation needed
      expect(getAvailableTemplates).not.toHaveBeenCalled();
    });

    it('should create project with event-planner as project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );
    });
  });

  describe('Template provided', () => {
    it('should use template name as project ID when template is provided', async () => {
      await createAgents({
        dirName: 'test-dir',
        template: 'chatbot',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should validate template exists
      expect(getAvailableTemplates).toHaveBeenCalled();

      // Should clone base template and the specified template
      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/create-agents-template',
        expect.any(String),
        undefined
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/chatbot',
        'src/projects/chatbot',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory (not in project subdirectory)
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );
    });

    it('should exit with error when template does not exist', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue(['event-planner', 'chatbot']);

      await expect(
        createAgents({
          dirName: 'test-dir',
          template: 'non-existent-template',
          openAiKey: 'test-openai-key',
        })
      ).rejects.toThrow('process.exit called');

      expect(p.cancel).toHaveBeenCalledWith(
        expect.stringContaining('Template "non-existent-template" not found')
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should show available templates when invalid template is provided', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue([
        'event-planner',
        'chatbot',
        'data-analysis',
      ]);

      await expect(
        createAgents({
          dirName: 'test-dir',
          template: 'invalid',
          openAiKey: 'test-openai-key',
        })
      ).rejects.toThrow('process.exit called');

      const cancelCall = vi.mocked(p.cancel).mock.calls[0][0];
      expect(cancelCall).toContain('event-planner');
      expect(cancelCall).toContain('chatbot');
      expect(cancelCall).toContain('data-analysis');
    });
  });

  describe('Custom Project ID provided', () => {
    it('should use custom project ID and not clone any template', async () => {
      await createAgents({
        dirName: 'test-dir',
        customProjectId: 'my-custom-project',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should clone base template but NOT project template
      expect(cloneTemplate).toHaveBeenCalledTimes(1);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/create-agents-template',
        expect.any(String),
        undefined
      );

      // Should NOT validate templates
      expect(getAvailableTemplates).not.toHaveBeenCalled();

      // Should create empty project directory
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my-custom-project');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my-custom-project/index.ts',
        expect.stringContaining('id: "my-custom-project"')
      );
    });

    it('should prioritize custom project ID over template if both are provided', async () => {
      await createAgents({
        dirName: 'test-dir',
        template: 'chatbot',
        customProjectId: 'my-custom-project',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should only clone base template, not project template
      expect(cloneTemplate).toHaveBeenCalledTimes(1);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/create-agents-template',
        expect.any(String),
        undefined
      );
      expect(getAvailableTemplates).not.toHaveBeenCalled();
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my-custom-project');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my-custom-project/index.ts',
        expect.stringContaining('id: "my-custom-project"')
      );
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle template names with hyphens correctly', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue([
        'my-complex-template',
        'another-template',
      ]);

      await createAgents({
        dirName: 'test-dir',
        template: 'my-complex-template',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/my-complex-template',
        'src/projects/my-complex-template',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );
    });

    it('should handle custom project IDs with special characters', async () => {
      await createAgents({
        dirName: 'test-dir',
        customProjectId: 'my_project-123',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my_project-123');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my_project-123/index.ts',
        expect.stringContaining('id: "my_project-123"')
      );
    });

    it('should create correct folder structure for all scenarios', async () => {
      // Test default
      await createAgents({
        dirName: 'dir1',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');

      // Reset mocks
      vi.clearAllMocks();
      setupDefaultMocks();

      // Test with template
      await createAgents({
        dirName: 'dir2',
        template: 'chatbot',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');

      // Reset mocks
      vi.clearAllMocks();
      setupDefaultMocks();

      // Test with custom ID
      await createAgents({
        dirName: 'dir3',
        customProjectId: 'custom',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/custom');
    });
  });

  describe('Skip provider option', () => {
    it('should use mock model configuration when skipProvider is true', async () => {
      await createAgents({
        dirName: 'test-dir',
        skipProvider: true,
      });

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.stringContaining('activities-planner'),
        'src/projects/activities-planner',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: defaultMockModelConfigurations,
            }),
          }),
        ])
      );

      const selectCalls = vi.mocked(p.select).mock.calls;
      const providerSelectCalls = selectCalls.filter(
        (call) =>
          call[0] &&
          typeof call[0] === 'object' &&
          'message' in call[0] &&
          call[0].message.includes('AI provider')
      );
      expect(providerSelectCalls).toHaveLength(0);
      expect(p.password).not.toHaveBeenCalled();
    });

    it('should use mock model configuration when skip is selected interactively', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('skip');

      await createAgents({
        dirName: 'test-dir',
      });

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.stringContaining('activities-planner'),
        'src/projects/activities-planner',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: defaultMockModelConfigurations,
            }),
          }),
        ])
      );

      expect(p.password).not.toHaveBeenCalled();
    });

    it('should take precedence over API key flags when skipProvider is true', async () => {
      await createAgents({
        dirName: 'test-dir',
        skipProvider: true,
        openAiKey: 'test-key',
      });

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.stringContaining('activities-planner'),
        'src/projects/activities-planner',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: defaultMockModelConfigurations,
            }),
          }),
        ])
      );
    });
  });

  describe('Environment file generation', () => {
    it('should contain INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET from .env.example', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET=test-bypass-secret-for-ci')
      );
    });

    it('should inject CLI-prompted API keys into the .env', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'sk-openai-123',
        anthropicKey: 'sk-ant-456',
        googleKey: 'google-789',
        azureKey: 'azure-abc',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ANTHROPIC_API_KEY=sk-ant-456')
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('OPENAI_API_KEY=sk-openai-123')
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('GOOGLE_GENERATIVE_AI_API_KEY=google-789')
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('AZURE_API_KEY=azure-abc')
      );
    });

    it('should use localhost URLs (not 127.0.0.1)', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('PUBLIC_INKEEP_AGENTS_API_URL=http://localhost:3002')
      );
    });

    it('should not generate any secrets inline', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      const envWriteCall = vi.mocked(fs.writeFile).mock.calls.find((call) => call[0] === '.env');
      const envContent = envWriteCall?.[1] as string;
      expect(envContent).toContain('BETTER_AUTH_SECRET=your-secret-key-change-in-production');
      expect(envContent).toContain('INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12');
      expect(envContent).toContain('# INKEEP_AGENTS_JWT_SIGNING_SECRET=');
    });
  });

  describe('Security - Password input for API keys', () => {
    it('should use password input instead of text input for API keys', async () => {
      // Mock the select to return 'anthropic' to trigger the API key prompt
      vi.mocked(p.select).mockResolvedValueOnce('anthropic');
      vi.mocked(p.password).mockResolvedValueOnce('test-anthropic-key');

      await createAgents({
        dirName: 'test-dir',
      });

      // Verify that p.password was called for the API key
      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your Anthropic API key:',
          validate: expect.any(Function),
        })
      );

      // Verify that p.text was NOT called for API keys (only for directory name)
      const textCalls = vi.mocked(p.text).mock.calls;
      const apiKeyCalls = textCalls.filter(
        (call) =>
          call[0] &&
          typeof call[0] === 'object' &&
          'message' in call[0] &&
          (call[0].message.includes('API key') ||
            call[0].message.includes('Anthropic') ||
            call[0].message.includes('OpenAI') ||
            call[0].message.includes('Google'))
      );
      expect(apiKeyCalls).toHaveLength(0);
    });

    it('should use password input for OpenAI keys', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('openai');
      vi.mocked(p.password).mockResolvedValueOnce('test-openai-key');

      await createAgents({
        dirName: 'test-dir',
      });

      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your OpenAI API key:',
          validate: expect.any(Function),
        })
      );
    });

    it('should use password input for Google keys', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('google');
      vi.mocked(p.password).mockResolvedValueOnce('test-google-key');

      await createAgents({
        dirName: 'test-dir',
      });

      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your Google API key:',
          validate: expect.any(Function),
        })
      );
    });
  });
});

// Helper to setup default mocks
function setupDefaultMocks() {
  vi.mocked(p.spinner).mockReturnValue(mockSpinner);
  vi.mocked(p.password).mockResolvedValue('test-api-key');
  vi.mocked(fs.pathExists).mockResolvedValue(false as any);
  vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.writeJson).mockResolvedValue(undefined);
  vi.mocked(fs.readJson).mockResolvedValue({});
  vi.mocked(fs.readFile).mockResolvedValue(mockEnvExample as any);
  vi.mocked(getAvailableTemplates).mockResolvedValue(['event-planner', 'chatbot', 'data-analysis']);
  vi.mocked(cloneTemplate).mockResolvedValue(undefined);
  vi.mocked(cloneTemplateLocal).mockResolvedValue(undefined);
  mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
}

describe('syncTemplateDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update @inkeep/* dependencies to match CLI version', async () => {
    const mockPkg = {
      name: 'test-project',
      dependencies: {
        '@inkeep/agents-core': '^0.50.3',
        '@inkeep/agents-sdk': '^0.50.3',
        'some-other-package': '^1.0.0',
      },
    };
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readJson).mockResolvedValue(mockPkg);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);

    await syncTemplateDependencies('/test/path');

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/test/path/package.json',
      expect.objectContaining({
        dependencies: {
          '@inkeep/agents-core': '^1.2.3',
          '@inkeep/agents-sdk': '^1.2.3',
          'some-other-package': '^1.0.0',
        },
      }),
      { spaces: 2 }
    );
  });

  it('should skip if template package.json does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as any);

    await syncTemplateDependencies('/test/path');

    expect(fs.readJson).not.toHaveBeenCalled();
    expect(fs.writeJson).not.toHaveBeenCalled();
  });

  it('should handle template with no @inkeep/* dependencies', async () => {
    const mockPkg = {
      name: 'test-project',
      dependencies: {
        'some-other-package': '^1.0.0',
      },
    };
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readJson).mockResolvedValue(mockPkg);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);

    await syncTemplateDependencies('/test/path');

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/test/path/package.json',
      expect.objectContaining({
        dependencies: {
          'some-other-package': '^1.0.0',
        },
      }),
      { spaces: 2 }
    );
  });

  it('should handle template with no devDependencies', async () => {
    const mockPkg = {
      name: 'test-project',
      dependencies: {
        '@inkeep/agents-core': '^0.50.3',
      },
    };
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readJson).mockResolvedValue(mockPkg);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);

    await syncTemplateDependencies('/test/path');

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/test/path/package.json',
      expect.objectContaining({
        dependencies: {
          '@inkeep/agents-core': '^1.2.3',
        },
      }),
      { spaces: 2 }
    );
  });

  it('should update devDependencies @inkeep/* packages', async () => {
    const mockPkg = {
      name: 'test-project',
      dependencies: {},
      devDependencies: {
        '@inkeep/agents-sdk': '^0.49.0',
        vitest: '^1.0.0',
      },
    };
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readJson).mockResolvedValue(mockPkg);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);

    await syncTemplateDependencies('/test/path');

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/test/path/package.json',
      expect.objectContaining({
        devDependencies: {
          '@inkeep/agents-sdk': '^1.2.3',
          vitest: '^1.0.0',
        },
      }),
      { spaces: 2 }
    );
  });

  it('should not modify non-@inkeep dependencies', async () => {
    const mockPkg = {
      name: 'test-project',
      dependencies: {
        '@inkeep/agents-core': '^0.50.3',
        react: '^18.0.0',
        next: '^14.0.0',
      },
    };
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readJson).mockResolvedValue(mockPkg);
    vi.mocked(fs.writeJson).mockResolvedValue(undefined);

    await syncTemplateDependencies('/test/path');

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/test/path/package.json',
      expect.objectContaining({
        dependencies: {
          '@inkeep/agents-core': '^1.2.3',
          react: '^18.0.0',
          next: '^14.0.0',
        },
      }),
      { spaces: 2 }
    );
  });
});
