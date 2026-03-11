import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import type { AgentSelect, ContextConfigSelect, ToolSelect } from '../types/entities';
import type { PinoLogger } from '../utils/logger';
import type { ScheduledTrigger } from '../validation/schemas';

export type EntityRowByTable = {
  scheduled_triggers: ScheduledTrigger;
  tools: ToolSelect;
  context_configs: ContextConfigSelect;
  agent: AgentSelect;
};

export type EntityOperation = 'insert' | 'update' | 'delete';

export type EntityDiff<TTable extends keyof EntityRowByTable = keyof EntityRowByTable> = {
  table: TTable;
  operation: EntityOperation;
  primaryKey: Record<string, string>;
  before: EntityRowByTable[TTable] | null;
  after: EntityRowByTable[TTable] | null;
};

export type EntityEffectHandlers<TTable extends keyof EntityRowByTable> = {
  onCreated?: (after: EntityRowByTable[TTable], ctx: ReconcileContext) => Promise<void>;
  onUpdated?: (
    before: EntityRowByTable[TTable],
    after: EntityRowByTable[TTable],
    ctx: ReconcileContext
  ) => Promise<void>;
  onDeleted?: (before: EntityRowByTable[TTable], ctx: ReconcileContext) => Promise<void>;
  check?: (ctx: AuditContext) => Promise<unknown>;
};

export type EntityEffectRegistry = {
  [K in keyof EntityRowByTable]?: EntityEffectHandlers<K>;
};

export function defineHandlers<TTable extends keyof EntityRowByTable>(
  _table: TTable,
  handlers: EntityEffectHandlers<TTable>
): EntityEffectHandlers<TTable> {
  return handlers;
}

export type ReconcileContext = {
  manageDb: AgentsManageDatabaseClient;
  runDb: AgentsRunDatabaseClient;
  scopes: { tenantId: string; projectId: string };
  logger: PinoLogger;
};

export type AuditContext = ReconcileContext;

export type AppliedEffect = {
  table: string;
  operation: EntityOperation;
  primaryKey: Record<string, string>;
};

export type FailedEffect = AppliedEffect & {
  error: string;
};

export type SkippedDiff = {
  table: string;
  operation: EntityOperation;
  primaryKey: Record<string, string>;
  reason: string;
};

export type ReconcileResult = {
  applied: AppliedEffect[];
  skipped: SkippedDiff[];
  failed: FailedEffect[];
};

export type EntityAuditEntry<TResult = unknown> = {
  table: string;
  result: TResult;
  error?: string;
};

export type AuditReport = {
  entries: EntityAuditEntry[];
  checkedEntities: string[];
  skippedEntities: string[];
};

export type ScheduledTriggerAuditResult = {
  missingWorkflows: Array<{ triggerId: string; triggerName: string }>;
  orphanedWorkflows: Array<{ workflowRunId: string; scheduledTriggerId: string }>;
};

export type OrphanedRuntimeRowsResult = {
  orphanedRows: Array<{ table: string; id: string; referencedEntityId: string }>;
};
