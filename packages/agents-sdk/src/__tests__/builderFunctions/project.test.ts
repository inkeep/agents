import { describe, expect, it } from 'vitest';
import { project } from '../../builderFunctions';
import type { ProjectConfig } from '../../project';
import { Project } from '../../project';

describe('project builder function', () => {
  it('should create a Project instance with basic configuration', () => {
    const config: ProjectConfig = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project for builder function',
    };

    const projectInstance = project(config);

    expect(projectInstance).toBeInstanceOf(Project);
    expect(projectInstance.getId()).toBe('test-project');
    expect(projectInstance.getName()).toBe('Test Project');
    expect(projectInstance.getDescription()).toBe('A test project for builder function');
  });

  it('should create a Project instance with full configuration', () => {
    const config: ProjectConfig = {
      id: 'full-project',
      name: 'Full Test Project',
      description: 'A full test project configuration',
      models: {
        base: { model: 'gpt-4o-mini' },
        structuredOutput: { model: 'gpt-4o' },
        summarizer: { model: 'gpt-3.5-turbo' },
      },
      stopWhen: {
        transferCountIs: 10,
        stepCountIs: 50,
      },
    };

    const projectInstance = project(config);
    // Set config after creation to provide tenantId
    projectInstance.setConfig('test-tenant', 'http://localhost:3002');

    expect(projectInstance).toBeInstanceOf(Project);
    expect(projectInstance.getId()).toBe('full-project');
    expect(projectInstance.getName()).toBe('Full Test Project');
    expect(projectInstance.getDescription()).toBe('A full test project configuration');
    expect(projectInstance.getTenantId()).toBe('test-tenant');
    expect(projectInstance.getModels()).toEqual(config.models);
    expect(projectInstance.getStopWhen()).toEqual(config.stopWhen);
  });

  it('should create a Project instance with default tenant ID when not provided', () => {
    const config: ProjectConfig = {
      id: 'minimal-project',
      name: 'Minimal Project',
    };

    const projectInstance = project(config);

    expect(projectInstance).toBeInstanceOf(Project);
    expect(projectInstance.getTenantId()).toBe('default');
  });

  it('should create a Project instance with graphs', () => {
    // Note: This test is simplified since we can't easily mock AgentGraph in this context
    // The main functionality is tested in the Project class tests
    const config: ProjectConfig = {
      id: 'project-with-graphs',
      name: 'Project with Graphs',
      graphs: () => [], // Empty array for this test
    };

    const projectInstance = project(config);

    expect(projectInstance).toBeInstanceOf(Project);
    expect(projectInstance.getGraphs()).toHaveLength(0);
  });
});
