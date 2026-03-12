import type {
  EntityDiff,
  EntityEffectHandlers,
  EntityEffectRegistry,
  EntityRowByTable,
  ReconcileContext,
  ReconcileResult,
} from './types';

export async function reconcile(
  registry: EntityEffectRegistry,
  diffs: EntityDiff[],
  ctx: ReconcileContext
): Promise<ReconcileResult> {
  const result: ReconcileResult = { applied: [], skipped: [], failed: [] };

  const operations = diffs.map(async (diff) => {
    const table = diff.table as keyof EntityRowByTable;
    const handlers = registry[table] as EntityEffectHandlers<typeof table> | undefined;

    if (!handlers) {
      result.skipped.push({
        table: diff.table,
        operation: diff.operation,
        primaryKey: diff.primaryKey,
        reason: 'no registry entry',
      });
      return;
    }

    try {
      if (diff.operation === 'insert' && handlers.onCreated && diff.after) {
        await handlers.onCreated(diff.after as any, ctx);
      } else if (diff.operation === 'update' && handlers.onUpdated && diff.before && diff.after) {
        await handlers.onUpdated(diff.before as any, diff.after as any, ctx);
      } else if (diff.operation === 'delete' && handlers.onDeleted && diff.before) {
        await handlers.onDeleted(diff.before as any, ctx);
      } else {
        result.skipped.push({
          table: diff.table,
          operation: diff.operation,
          primaryKey: diff.primaryKey,
          reason: `no handler for ${diff.operation}`,
        });
        return;
      }

      result.applied.push({
        table: diff.table,
        operation: diff.operation,
        primaryKey: diff.primaryKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(
        {
          table: diff.table,
          operation: diff.operation,
          primaryKey: diff.primaryKey,
          error: errorMessage,
        },
        `Reconcile effect failed for ${diff.table}.${diff.operation}`
      );
      result.failed.push({
        table: diff.table,
        operation: diff.operation,
        primaryKey: diff.primaryKey,
        error: errorMessage,
      });
    }
  });

  await Promise.allSettled(operations);

  return result;
}
