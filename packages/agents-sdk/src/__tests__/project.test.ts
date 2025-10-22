import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../agent';
import type { ProjectConfig } from '../project';
import { Project } from '../project';
import { SubAgent } from '../subAgent';
import type { AgentConfig } from '../types';

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ data: {} }),
    text: async () => '',
    status: 200,
    statusText: 'OK',
  } as any)
);
global.fetch = mockFetch as any;

describe('Project', () => {
  let projectConfig: ProjectConfig;
  let agentConfig: AgentConfig;

  // Mock project data for API responses
  const mockProjectData = {
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    agents: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables for testing
    process.env.ENVIRONMENT = 'test';
    process.env.INKEEP_API_URL = 'http://localhost:3002';

    const subAgent = new SubAgent({
      id: 'test-sub-agent',
      name: 'Test Sub Agent',
      description: 'A test sub agent',
      prompt: 'A test sub agent prompt',
    });

    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      defaultSubAgent: subAgent,
    };

    projectConfig = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      models: {
        base: { model: 'gpt-4o-mini' },
        structuredOutput: { model: 'gpt-4o' },
        summarizer: { model: 'gpt-3.5-turbo' },
      },
      stopWhen: {
        transferCountIs: 5,
        stepCountIs: 25,
      },
    };
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT;
    delete process.env.INKEEP_API_URL;
    mockFetch.mockClear();
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should create a project with basic configuration', () => {
      const project = new Project(projectConfig);
      // Set config to provide tenantId
      project.setConfig('test-tenant', 'http://localhost:3002');

      expect(project.getId()).toBe('test-project');
      expect(project.getName()).toBe('Test Project');
      expect(project.getDescription()).toBe('A test project');
      expect(project.getTenantId()).toBe('test-tenant');
      expect(project.getModels()).toEqual(projectConfig.models);
      expect(project.getStopWhen()).toEqual(projectConfig.stopWhen);
    });

    it('should use default values when optional fields are not provided', () => {
      const minimalConfig: ProjectConfig = {
        id: 'minimal-project',
        name: 'Minimal Project',
      };

      const project = new Project(minimalConfig);

      expect(project.getId()).toBe('minimal-project');
      expect(project.getName()).toBe('Minimal Project');
      expect(project.getDescription()).toBeUndefined();
      expect(project.getTenantId()).toBe('default');
      expect(project.getModels()).toBeUndefined();
      expect(project.getStopWhen()).toBeUndefined();
    });

    it('should initialize agents if provided in config', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent],
      };

      const project = new Project(configWithAgents);

      expect(project.getAgents()).toHaveLength(1);
      expect(project.getAgent('test-agent')).toBe(mockAgent);
      // Agent are initially set with defaults, setConfig is called with 'default' tenantId
      expect(mockAgent.setConfig).toHaveBeenCalledWith(
        'default',
        'test-project',
        'http://localhost:3002'
      );
    });
  });

  describe('setConfig', () => {
    it('should update tenant ID and API URL', () => {
      const project = new Project(projectConfig);

      project.setConfig('new-tenant', 'http://new-api.com');

      expect(project.getTenantId()).toBe('new-tenant');
    });

    it('should propagate config changes to all agent', () => {
      const mockAgent1 = new Agent(agentConfig);
      const mockAgent2 = new Agent({ ...agentConfig, id: 'test-agent-2' });
      vi.spyOn(mockAgent1, 'setConfig').mockImplementation(() => {});
      vi.spyOn(mockAgent2, 'setConfig').mockImplementation(() => {});

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent1, mockAgent2],
      };

      const project = new Project(configWithAgents);
      project.setConfig('new-tenant', 'http://new-api.com');

      expect(mockAgent1.setConfig).toHaveBeenCalledWith(
        'new-tenant',
        'test-project',
        'http://new-api.com'
      );
      expect(mockAgent2.setConfig).toHaveBeenCalledWith(
        'new-tenant',
        'test-project',
        'http://new-api.com'
      );
    });

    it('should throw error if called after initialization', async () => {
      const project = new Project(projectConfig);

      // Mock successful API call for initialization
      // The project init will make a PUT call to update the project
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockProjectData }),
      });

      await project.init();

      expect(() => {
        project.setConfig('new-tenant', 'http://new-api.com');
      }).toThrow('Cannot set config after project has been initialized');
    });
  });

  describe('init', () => {
    it('should initialize project and create it in backend', async () => {
      const project = new Project(projectConfig);
      // Set config to provide tenantId
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Mock successful full project API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockProjectData }),
      });

      await project.init();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant/project-full/test-project',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );

      expect((project as any).initialized).toBe(true);
    });

    it('should update existing project in backend', async () => {
      const project = new Project(projectConfig);
      // Set config to provide tenantId
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Mock successful full project API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockProjectData }),
      });

      await project.init();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant/project-full/test-project',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );

      expect((project as any).initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      const project = new Project(projectConfig);

      // Mock successful full project API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockProjectData }),
      });

      await project.init();

      // Clear mock calls
      mockFetch.mockClear();

      // Second init call should not make API calls
      await project.init();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const project = new Project(projectConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(project.init()).rejects.toThrow('Server error');
    });
  });

  describe('agent management', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project(projectConfig);
      // Set config to provide tenantId
      project.setConfig('test-tenant', 'http://localhost:3002');
    });

    it('should add an agent to the project', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});

      project.addAgent(mockAgent);

      expect(project.getAgents()).toHaveLength(1);
      expect(project.getAgent('test-agent')).toBe(mockAgent);
      expect(mockAgent.setConfig).toHaveBeenCalledWith(
        'test-tenant',
        'test-project',
        'http://localhost:3002'
      );
    });

    it('should remove an agent from the project', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});

      project.addAgent(mockAgent);
      expect(project.getAgents()).toHaveLength(1);

      const removed = project.removeAgent('test-agent');
      expect(removed).toBe(true);
      expect(project.getAgents()).toHaveLength(0);
      expect(project.getAgent('test-agent')).toBeUndefined();
    });

    it('should return false when removing non-existent agent', () => {
      const removed = project.removeAgent('non-existent-agent');
      expect(removed).toBe(false);
    });
  });

  describe('model and stopWhen management', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project(projectConfig);
    });

    it('should set and get models', () => {
      const newModels = {
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4-turbo' },
      };

      project.setModels(newModels);
      expect(project.getModels()).toEqual(newModels);
    });

    it('should set and get stopWhen configuration', () => {
      const newStopWhen = {
        transferCountIs: 15,
        stepCountIs: 75,
      };

      project.setStopWhen(newStopWhen);
      expect(project.getStopWhen()).toEqual(newStopWhen);
    });
  });

  describe('getStats', () => {
    it('should return project statistics', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent],
      };

      const project = new Project(configWithAgents);
      // Set config to provide tenantId
      project.setConfig('test-tenant', 'http://localhost:3002');
      const stats = project.getStats();

      expect(stats).toEqual({
        agentCount: 1,
        initialized: false,
        projectId: 'test-project',
        tenantId: 'test-tenant',
      });
    });
  });

  describe('validate', () => {
    it('should validate a valid project', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});
      vi.spyOn(mockAgent, 'validate').mockReturnValue({ valid: true, errors: [] });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent],
      };

      const project = new Project(configWithAgents);
      const validation = project.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing project ID', () => {
      const invalidConfig = { ...projectConfig };
      delete (invalidConfig as any).id;

      const project = new Project({ ...invalidConfig, id: '' });
      const validation = project.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Project must have an ID');
    });

    it('should detect missing project name', () => {
      const invalidConfig = { ...projectConfig };
      delete (invalidConfig as any).name;

      const project = new Project({ ...invalidConfig, name: '' });
      const validation = project.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Project must have a name');
    });

    it('should detect duplicate agent IDs', () => {
      const mockAgent1 = new Agent(agentConfig);
      const mockAgent2 = new Agent(agentConfig); // Same ID
      vi.spyOn(mockAgent1, 'setConfig').mockImplementation(() => {});
      vi.spyOn(mockAgent2, 'setConfig').mockImplementation(() => {});

      const configWithDuplicateAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent1, mockAgent2],
      };

      const project = new Project(configWithDuplicateAgents);
      const validation = project.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Duplicate agent ID: test-agent');
    });

    it('should propagate agent validation errors', () => {
      const mockAgent = new Agent(agentConfig);
      vi.spyOn(mockAgent, 'setConfig').mockImplementation(() => {});
      vi.spyOn(mockAgent, 'validate').mockReturnValue({
        valid: false,
        errors: ['Agent has no agents', 'No default agent configured'],
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent],
      };

      const project = new Project(configWithAgents);
      const validation = project.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Agent 'test-agent': Agent has no agents");
      expect(validation.errors).toContain("Agent 'test-agent': No default agent configured");
    });
  });

  describe('API format conversion', () => {
    it('should include project configuration in full definition', async () => {
      const project = new Project(projectConfig);

      // Test through the public toFullProjectDefinition method
      const fullDef = await (project as any).toFullProjectDefinition();

      expect(fullDef.id).toBe('test-project');
      expect(fullDef.name).toBe('Test Project');
      expect(fullDef.description).toBe('A test project');
      expect(fullDef.models).toEqual(projectConfig.models);
      expect(fullDef.stopWhen).toEqual(projectConfig.stopWhen);
    });

    it('should handle missing description in full definition', async () => {
      const configWithoutDescription = { ...projectConfig };
      delete configWithoutDescription.description;

      const project = new Project(configWithoutDescription);
      const fullDef = await (project as any).toFullProjectDefinition();

      expect(fullDef.description).toBe('');
    });
  });

  describe('toFullProjectDefinition', () => {
    it('should convert project to full project definition format', async () => {
      const mockAgent1 = new Agent(agentConfig);
      const mockAgent2 = new Agent({ ...agentConfig, id: 'test-agent-2' });

      vi.spyOn(mockAgent1, 'setConfig').mockImplementation(() => {});
      vi.spyOn(mockAgent2, 'setConfig').mockImplementation(() => {});

      // Mock the toFullAgentDefinition method
      const mockAgentDef1 = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        agents: {},
        tools: {},
      };
      const mockAgentDef2 = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        description: 'Another test agent',
        agents: {},
        tools: {},
      };

      vi.spyOn(mockAgent1 as any, 'toFullAgentDefinition').mockResolvedValue(mockAgentDef1);
      vi.spyOn(mockAgent2 as any, 'toFullAgentDefinition').mockResolvedValue(mockAgentDef2);

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [mockAgent1, mockAgent2],
      };

      const project = new Project(configWithAgents);
      const fullProjectDef = await (project as any).toFullProjectDefinition();

      expect(fullProjectDef).toMatchObject({
        id: 'test-project',
        name: 'Test Project',
        description: 'A test project',
        models: projectConfig.models,
        stopWhen: projectConfig.stopWhen,
        agents: {
          'test-agent': mockAgentDef1,
          'test-agent-2': mockAgentDef2,
        },
        credentialReferences: undefined,
      });

      expect(fullProjectDef.createdAt).toBeDefined();
      expect(fullProjectDef.updatedAt).toBeDefined();
    });

    it('should handle projects with no agents', async () => {
      const project = new Project(projectConfig);
      const fullProjectDef = await (project as any).toFullProjectDefinition();

      expect(fullProjectDef).toMatchObject({
        id: 'test-project',
        name: 'Test Project',
        description: 'A test project',
        models: projectConfig.models,
        stopWhen: projectConfig.stopWhen,
        agents: {},
        credentialReferences: undefined,
      });
    });

    it('should handle projects with missing description', async () => {
      const configWithoutDescription = { ...projectConfig };
      delete configWithoutDescription.description;

      const project = new Project(configWithoutDescription);
      const fullProjectDef = await (project as any).toFullProjectDefinition();

      expect(fullProjectDef.description).toBe('');
    });
  });
});
