# Evidence: Current State of Dataset/Evaluator Scoping

**Dimension:** Current state analysis
**Date:** 2026-03-11
**Sources:** packages/agents-core/src/db/manage/manage-schema.ts, packages/agents-core/src/validation/schemas.ts, packages/agents-core/src/types/utility.ts, packages/agents-core/src/data-access/manage/evalConfig.ts

---

## Key files referenced

- `packages/agents-core/src/db/manage/manage-schema.ts` — All eval-related table definitions
- `packages/agents-core/src/types/utility.ts:386-389` — `EvaluationSuiteFilterCriteria` type
- `packages/agents-core/src/data-access/manage/evalConfig.ts` — All eval data access functions
- `packages/agents-core/src/validation/schemas.ts:1557-1568` — `EvaluationJobFilterCriteriaSchema`

---

## Findings

### Finding: Datasets are project-scoped with no agent link
**Confidence:** CONFIRMED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:474-489`

```
export const dataset = pgTable('dataset', {
  ...projectScoped,       // tenantId, projectId, id
  name: uiProperties.name,
  ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.projectId, table.id] }),
  foreignKey({ ... foreignColumns: [projects.tenantId, projects.id] }).onDelete('cascade'),
]);
```

No `agentId` column. Only FK is to `projects`.

### Finding: Evaluators are project-scoped with no agent link
**Confidence:** CONFIRMED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:522-541`

```
export const evaluator = pgTable('evaluator', {
  ...projectScoped,
  ...uiProperties,
  prompt: text('prompt').notNull(),
  schema: jsonb('schema').notNull(),
  model: jsonb('model').notNull(),
  passCriteria: jsonb('pass_criteria'),
  ...timestamps,
});
```

No `agentId` column. Only FK is to `projects`.

### Finding: datasetRunConfig has agent relations via join table
**Confidence:** CONFIRMED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:946-969`

```
export const datasetRunConfigAgentRelations = pgTable('dataset_run_config_agent_relations', {
  ...projectScoped,
  datasetRunConfigId: varchar('dataset_run_config_id').notNull(),
  agentId: varchar('agent_id').notNull(),
});
```

This is a many-to-many join between `datasetRunConfig` and `agents`. It's the ONLY existing agent-dataset link in the schema.

### Finding: EvaluationSuiteFilterCriteria supports agentIds but it's not enforced
**Confidence:** CONFIRMED
**Evidence:** `packages/agents-core/src/types/utility.ts:386-389`

```
export type EvaluationSuiteFilterCriteria = {
  agentIds?: string[];
  [key: string]: unknown;
};
```

And in `agents-api/src/domains/evals/routes/evaluationTriggers.ts:115-116`:
"Check if run config matches conversation (using filters) — For now, we match all - can add filter logic later if needed."

The `agentIds` field exists in the type but the filter logic is NOT implemented.

### Finding: Data access layer has no agent-scoped queries for eval entities
**Confidence:** CONFIRMED
**Evidence:** `packages/agents-core/src/data-access/manage/evalConfig.ts`

All `listDatasets`, `listEvaluators`, `listEvaluationSuiteConfigs` functions accept only `ProjectScopeConfig` (tenantId + projectId). There is no `listDatasetsByAgent` or equivalent.

The only agent-related function is `getDatasetRunConfigAgentRelations` which queries by `datasetRunConfigId`, not by `agentId`.

---

## Gaps / follow-ups

- No function exists to query "which datasets/evaluators have been used with agent X" across run configs
- The evaluationSuiteConfig filter mechanism is typed but not implemented
