# Evidence: Schema-Based Options Analysis

**Dimension:** Options 1-4 (schema-level approaches)
**Date:** 2026-03-11
**Sources:** packages/agents-core/src/db/manage/manage-schema.ts, packages/agents-core/src/data-access/manage/evalConfig.ts, packages/agents-core/src/validation/schemas.ts

---

## Key files referenced

- `packages/agents-core/src/db/manage/manage-schema.ts:472-556` — dataset, evaluator, datasetRunConfig tables
- `packages/agents-core/src/db/manage/manage-schema.ts:801-818` — evaluationSuiteConfig table
- `packages/agents-core/src/db/manage/manage-schema.ts:946-976` — datasetRunConfigAgentRelations
- `agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts:159-208` — create run config with agentIds
- `agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts:264-384` — trigger dataset run
- `agents-api/src/domains/evals/routes/evaluationTriggers.ts:115-116` — filter match-all comment

---

## Findings

### Finding: Option 1 (Direct FK) — feasible, one-to-one limitation
**Confidence:** INFERRED
**Evidence:** Schema pattern analysis

Adding optional `agentId` to `dataset` and `evaluator` tables follows the existing `projectScoped` pattern.

```sql
-- Would look like:
ALTER TABLE dataset ADD COLUMN agent_id VARCHAR(256);
ALTER TABLE evaluator ADD COLUMN agent_id VARCHAR(256);
```

**Implications:**
- Simple schema change — one new nullable column per table
- Migration is additive (no breaking change for existing rows — NULL = project-wide)
- Data access: `listDatasets` gains optional `agentId` filter param
- Limitation: 1:1 mapping — a dataset can belong to at most one agent
- If a dataset is useful for multiple agents (e.g., general quality checks), it must remain unscoped (NULL agent_id) or be duplicated
- Follows the pattern of `contextConfigId` on agents table (optional FK reference)

### Finding: Option 2 (Join tables) — feasible, M:N support, follows existing patterns
**Confidence:** INFERRED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:946-976` (existing join table pattern)

The codebase already uses join tables for M:N relationships:
- `datasetRunConfigAgentRelations` (run config ↔ agents)
- `evaluationSuiteConfigEvaluatorRelations` (suite config ↔ evaluators)
- `evaluationJobConfigEvaluatorRelations` (job config ↔ evaluators)

New tables would follow the exact same pattern:

```typescript
export const agentDatasetRelations = pgTable('agent_dataset_relations', {
  ...projectScoped,
  agentId: varchar('agent_id').notNull(),
  datasetId: varchar('dataset_id').notNull(),
  ...timestamps,
}, ...);

export const agentEvaluatorRelations = pgTable('agent_evaluator_relations', {
  ...projectScoped,
  agentId: varchar('agent_id').notNull(),
  evaluatorId: varchar('evaluator_id').notNull(),
  ...timestamps,
}, ...);
```

**Implications:**
- M:N — a dataset can belong to multiple agents, an agent can have multiple datasets
- Migration is additive (new tables, no changes to existing tables)
- Data access: new `listDatasetsByAgent`, `listEvaluatorsByAgent` functions
- Follows established join table conventions in the codebase
- More tables to maintain but more flexible than Option 1

### Finding: Option 3 (datasetRunConfig as binding) — exists but semantically wrong
**Confidence:** INFERRED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:534-556`, `agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts:264-384`

`datasetRunConfig` links `datasetId` + `agentIds` (via join table). The improvement agent could:
1. List all `datasetRunConfigs`
2. For each, check `datasetRunConfigAgentRelations` for the target agent
3. Extract `datasetId` from matching configs

**Implications:**
- Zero schema change — infrastructure exists
- Semantically wrong: `datasetRunConfig` is "how to run a dataset" not "which datasets belong to an agent"
- Cold start: fails if no run configs exist yet for the target agent
- Fragile: run configs are created per-run by the Feedback Analyst, not as persistent associations
- Multiple run configs could reference the same dataset with different agent sets
- Query complexity: requires joining across run configs and their agent relations

### Finding: Option 4 (evaluationSuiteConfig) — partially exists but misfit
**Confidence:** INFERRED
**Evidence:** `packages/agents-core/src/db/manage/manage-schema.ts:801-818`, `packages/agents-core/src/types/utility.ts:386-389`

`evaluationSuiteConfig` has:
- `filters: Filter<EvaluationSuiteFilterCriteria>` where `EvaluationSuiteFilterCriteria = { agentIds?: string[] }`
- `evaluationSuiteConfigEvaluatorRelations` (links suite ↔ evaluators)

Could be extended to also carry dataset associations.

**Implications:**
- Agent filter exists in the type but is NOT implemented (match-all in evaluationTriggers.ts)
- Would need: implement filter logic + add dataset relations to suite configs
- Suite configs are designed for conversation-based auto-eval (trigger on conversation end), not for dataset runs
- Mixing dataset run scoping into conversation eval suite configs conflates two different evaluation modes
- Would require significant rework to make suites work as the canonical agent-eval binding

---

## Gaps / follow-ups

- Need to evaluate whether the `projectScoped` pattern's ID generation supports the new join tables cleanly
- The `datasetRunConfigAgentRelations` data access has no "list by agentId" function, only "list by datasetRunConfigId"
