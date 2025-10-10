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
}

export class FunctionTool implements FunctionToolInterface {
  public config: FunctionToolConfig;
  private id: string;

  constructor(config: FunctionToolConfig) {
    this.config = config;
    this.id = generateIdFromName(config.name);

    if (!config.dependencies) {
      const executeCode =
        typeof config.execute === 'string' ? config.execute : config.execute.toString();
      ``;
      const deps = getFunctionToolDeps(config.name, executeCode);
      for (const dep in deps) {
        if (deps[dep] === false) {
          delete deps[dep];
        }
        throw new Error(`Dependency \x1b[1;32m${dep}\x1b[0m used in function tool \x1b[1;32m${config.name}\x1b[0m is neither installed nor in dependencies object.`);
      }
      this.config.dependencies = deps as Record<string, string>;
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
    // If execute is a string, we can't return it as a function
    // This method is primarily for runtime execution, not serialization
    if (typeof this.config.execute === 'string') {
      throw new Error(
        'Cannot get execute function from string-based function tool. Use serializeFunction() instead.'
      );
    }
    return this.config.execute;
  }

  // Serialize the function (global entity) for storage
  serializeFunction(): {
    id: string;
    inputSchema: Record<string, unknown>;
    executeCode: string;
    dependencies: Record<string, string>;
  } {
    const executeCode =
      typeof this.config.execute === 'string'
        ? this.config.execute
        : this.config.execute.toString();

    return {
      id: this.id,
      inputSchema: this.config.inputSchema,
      executeCode,
      dependencies: this.config.dependencies || {},
    };
  }

  // Serialize the tool (project-scoped) for storage
  serializeTool(): {
    id: string;
    name: string;
    description: string;
    functionId: string;
  } {
    return {
      id: this.id,
      name: this.config.name,
      description: this.config.description,
      functionId: this.id, // The function ID is the same as the tool ID in this context
    };
  }
}
