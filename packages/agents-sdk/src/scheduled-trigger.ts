import type { ScheduledTriggerApiInsert } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import { generateIdFromName } from './utils/generateIdFromName';

const logger = getLogger('scheduled-trigger');

// Type for the config that users provide
export type ScheduledTriggerConfig = Omit<ScheduledTriggerApiInsert, 'id'> & {
  id?: string;
};

export interface ScheduledTriggerInterface {
  getId(): string;
  getName(): string;
  getConfig(): Omit<ScheduledTriggerApiInsert, 'id'> & { id: string };
  with(config: Partial<ScheduledTriggerConfig>): ScheduledTrigger;
}

export class ScheduledTrigger implements ScheduledTriggerInterface {
  private config: ScheduledTriggerApiInsert & { id: string };
  private id: string;

  constructor(config: ScheduledTriggerConfig) {
    this.id = config.id || generateIdFromName(config.name);

    this.config = {
      ...config,
      id: this.id,
    };

    logger.info(
      {
        scheduledTriggerId: this.getId(),
        scheduledTriggerName: config.name,
        cronExpression: config.cronExpression,
        runAt: config.runAt,
      },
      'ScheduledTrigger constructor initialized'
    );
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.config.name;
  }

  getConfig(): Omit<ScheduledTriggerApiInsert, 'id'> & { id: string } {
    return this.config;
  }

  /**
   * Creates a new ScheduledTrigger with the given configuration overrides.
   *
   * @param config - Partial configuration to override
   * @returns A new ScheduledTrigger instance with the merged configuration
   *
   * @example
   * ```typescript
   * const trigger = new ScheduledTrigger({
   *   name: 'Daily Report',
   *   cronExpression: '0 9 * * *',
   *   messageTemplate: 'Generate daily report for {{date}}',
   * });
   * const disabled = trigger.with({ enabled: false });
   * ```
   */
  with(config: Partial<ScheduledTriggerConfig>): ScheduledTrigger {
    const mergedConfig = {
      ...this.config,
      ...config,
    } as ScheduledTriggerConfig;

    return new ScheduledTrigger(mergedConfig);
  }
}
