import { getLogger } from '@inkeep/agents-core';
import prettier from 'prettier';
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
      this.config.dependencies = getFunctionToolDeps(config.name, executeCode);
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

  // Serialize the function (global entity) for storage
  serializeFunction(): {
    id: string;
    inputSchema: Record<string, unknown>;
    executeCode: string;
    dependencies: Record<string, string>;
  } {
    // Get the code string
    let executeCode =
      typeof this.config.execute === 'string'
        ? this.config.execute
        : this.config.execute.toString();

    // Format with Prettier for consistent formatting
    try {
      executeCode = prettier.format(executeCode, {
        parser: 'babel',
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 80,
      });
    } catch (error) {
      // If formatting fails, use original code
      logger.warn({ functionId: this.id, error }, 'Failed to format function code with Prettier');
    }

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
