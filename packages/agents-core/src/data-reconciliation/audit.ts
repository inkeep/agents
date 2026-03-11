import type { AuditContext, AuditReport, EntityEffectRegistry } from './types';

export async function audit(
  registry: EntityEffectRegistry,
  ctx: AuditContext
): Promise<AuditReport> {
  const report: AuditReport = {
    entries: [],
    checkedEntities: [],
    skippedEntities: [],
  };

  for (const [table, handlers] of Object.entries(registry)) {
    if (!handlers?.check) {
      report.skippedEntities.push(table);
      continue;
    }

    report.checkedEntities.push(table);

    try {
      const result = await handlers.check(ctx);
      report.entries.push({ table, result });
    } catch (error) {
      report.entries.push({
        table,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
