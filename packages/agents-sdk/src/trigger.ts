import {
  convertZodToJsonSchema,
  getLogger,
  isZodSchema,
  type TriggerApiInsert,
} from '@inkeep/agents-core';
import type { z } from 'zod';
import { generateIdFromName } from './utils/generateIdFromName';

const logger = getLogger('trigger');

// Type for the config that can accept Zod schemas
export type TriggerConfig = Omit<TriggerApiInsert, 'id' | 'inputSchema'> & {
  id?: string;
  inputSchema?: Record<string, unknown> | z.ZodObject<any> | null;
};

// Internal alias for backward compatibility
type TriggerConfigWithZod = TriggerConfig;

export interface TriggerInterface {
  getId(): string;
  getName(): string;
  getConfig(): Omit<TriggerApiInsert, 'id'> & { id: string };
  with(config: Partial<TriggerConfigWithZod>): Trigger;
}

export class Trigger implements TriggerInterface {
  private config: TriggerApiInsert & { id: string };
  private id: string;

  constructor(config: TriggerConfigWithZod) {
    this.id = config.id || generateIdFromName(config.name);

    // Convert Zod schema to JSON Schema if needed
    let processedInputSchema: Record<string, unknown> | undefined;
    if (config.inputSchema === null) {
      processedInputSchema = undefined;
    } else if (config.inputSchema && isZodSchema(config.inputSchema)) {
      processedInputSchema = convertZodToJsonSchema(config.inputSchema) as Record<string, unknown>;
    } else {
      processedInputSchema = config.inputSchema as Record<string, unknown> | undefined;
    }

    this.config = {
      ...config,
      id: this.id,
      inputSchema: processedInputSchema,
    };

    logger.info(
      {
        triggerId: this.getId(),
        triggerName: config.name,
      },
      'Trigger constructor initialized'
    );
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.config.name;
  }

  getConfig(): Omit<TriggerApiInsert, 'id'> & { id: string } {
    return this.config;
  }

  /**
   * Creates a new Trigger with the given configuration overrides.
   *
   * @param config - Partial configuration to override
   * @returns A new Trigger instance with the merged configuration
   *
   * example:
   * ```typescript
   * const trigger = new Trigger({
   *   name: 'GitHub Webhook',
   *   messageTemplate: 'New event: {{action}}',
   *   authentication: { type: 'none' },
   * });
   * const customizedTrigger = trigger.with({ enabled: false });
   * ```
   */
  with(config: Partial<TriggerConfigWithZod>): Trigger {
    // Convert Zod schema to JSON Schema if needed in the override
    let processedInputSchema: Record<string, unknown> | undefined;
    if (config.inputSchema !== undefined) {
      if (config.inputSchema === null) {
        processedInputSchema = undefined;
      } else if (isZodSchema(config.inputSchema)) {
        processedInputSchema = convertZodToJsonSchema(config.inputSchema) as Record<
          string,
          unknown
        >;
      } else {
        processedInputSchema = config.inputSchema as Record<string, unknown> | undefined;
      }
    }

    // Merge current config with override
    // Cast is needed because TriggerApiInsert has broader inputSchema type from Drizzle
    const mergedConfig = {
      ...this.config,
      ...config,
      ...(processedInputSchema !== undefined && { inputSchema: processedInputSchema }),
    } as TriggerConfigWithZod;

    return new Trigger(mergedConfig);
  }
}
