import type { ScheduledTriggerInsert } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import { generateIdFromName } from './utils/generateIdFromName';

const logger = getLogger('scheduled-trigger');

// Type for the config that users provide
export type ScheduledTriggerConfig = Omit<ScheduledTriggerInsert, 'id'> & {
  id?: string;
};

export interface ScheduledTriggerInterface {
  getId(): string;
  getName(): string;
  getConfig(): Omit<ScheduledTriggerInsert, 'id'> & { id: string };
  with(config: Partial<ScheduledTriggerConfig>): ScheduledTrigger;
}

export class ScheduledTrigger implements ScheduledTriggerInterface {
  private config: ScheduledTriggerInsert & { id: string };
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

  getConfig(): Omit<ScheduledTriggerInsert, 'id'> & { id: string } {
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

/**
 * Factory function for creating scheduled triggers with cron expressions.
 *
 * @example
 * ```typescript
 * const dailyReport = scheduledTrigger({
 *   name: 'Daily Report',
 *   cronExpression: '0 9 * * *', // Every day at 9 AM
 *   messageTemplate: 'Generate the daily report',
 * });
 * ```
 */
export function scheduledTrigger(config: ScheduledTriggerConfig): ScheduledTrigger {
  return new ScheduledTrigger(config);
}

/**
 * Factory function for creating one-time scheduled triggers.
 *
 * @example
 * ```typescript
 * const oneTimeTask = oneTimeTrigger({
 *   name: 'Migration Task',
 *   runAt: '2024-12-31T23:59:59Z',
 *   messageTemplate: 'Run the migration',
 * });
 * ```
 */
export function oneTimeTrigger(
  config: Omit<ScheduledTriggerConfig, 'cronExpression'> & { runAt: string }
): ScheduledTrigger {
  return new ScheduledTrigger({
    ...config,
    cronExpression: null,
  });
}

/**
 * Factory function for creating recurring scheduled triggers with cron.
 *
 * @example
 * ```typescript
 * const hourlyCheck = cronTrigger({
 *   name: 'Hourly Health Check',
 *   cronExpression: '0 * * * *', // Every hour
 *   messageTemplate: 'Check system health',
 * });
 * ```
 */
export function cronTrigger(
  config: Omit<ScheduledTriggerConfig, 'runAt'> & { cronExpression: string }
): ScheduledTrigger {
  return new ScheduledTrigger({
    ...config,
    runAt: null,
  });
}
