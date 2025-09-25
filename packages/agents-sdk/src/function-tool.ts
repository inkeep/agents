import { getLogger } from '@inkeep/agents-core';
import type { FunctionToolConfig } from './types';
import { generateIdFromName } from './utils/generateIdFromName';
import { getFunctionToolDeps } from './utils/getFunctionToolDeps';

const logger = getLogger('function-tool');

export interface FunctionToolInterface {
  config: FunctionToolConfig;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getInputSchema(): Record<string, unknown>;
  getDependencies(): Record<string, string>;
  getExecuteFunction(): (params: any) => Promise<any>;
  getSandboxConfig(): FunctionToolConfig['sandboxConfig'];
}

export class FunctionTool implements FunctionToolInterface {
  public config: FunctionToolConfig;
  private id: string;

  constructor(config: FunctionToolConfig) {
    this.config = config;
    this.id = generateIdFromName(config.name);

    if (!config.dependencies) {
      this.config.dependencies = getFunctionToolDeps(config.name, config.execute.toString());
    }

    logger.info(
      {
        id: this.id,
        name: config.name,
      },
      'FunctionTool constructor initialized'
    );
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description;
  }

  getInputSchema(): Record<string, unknown> {
    return this.config.inputSchema;
  }

  getDependencies(): Record<string, string> {
    return this.config.dependencies || {};
  }

  getExecuteFunction(): (params: any) => Promise<any> {
    return this.config.execute;
  }

  getSandboxConfig(): FunctionToolConfig['sandboxConfig'] {
    return (
      this.config.sandboxConfig || {
        provider: 'local',
        runtime: 'node22',
        timeout: 30000,
        vcpus: 1,
      }
    );
  }

  // Serialize the function for storage
  serialize(): {
    id: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    dependencies: Record<string, string>;
    executeCode: string;
    sandboxConfig: FunctionToolConfig['sandboxConfig'];
  } {
    return {
      id: this.id,
      name: this.config.name,
      description: this.config.description,
      inputSchema: this.config.inputSchema,
      dependencies: this.config.dependencies || {},
      executeCode: this.config.execute.toString(),
      sandboxConfig: this.getSandboxConfig(),
    };
  }
}
