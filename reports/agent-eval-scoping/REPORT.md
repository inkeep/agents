---
title: "Agent-Scoped Evaluation: Options for Binding Datasets and Evaluators to Agents"
description: "Analysis of options for scoping datasets and evaluators to specific agents so the improvement agent can automatically select the right eval resources for baseline evaluations in multi-agent projects."
createdAt: 2026-03-11
updatedAt: 2026-03-11
subjects:
  - Inkeep Agent Framework
  - Feedback Improver
  - Evaluation System
topics:
  - agent evaluation scoping
  - dataset agent binding
  - improvement agent
---

# Agent-Scoped Evaluation: Options for Binding Datasets and Evaluators to Agents

**Purpose:** When a project contains multiple agents, the improvement agent (Feedback Analyst) currently has no way to know which datasets and evaluators are relevant to the agent being improved — it uses *all* of them. This report enumerates and analyzes the viable options for solving this, ranging from schema-level changes to pure behavioral/prompt approaches.

---

## Executive Summary

The current eval system scopes datasets and evaluators to **projects**, not agents. The Feedback Analyst calls `list-datasets` and `list-evaluators` and uses everything returned — which is correct for single-agent projects but broken for multi-agent ones.

There are **10 distinct options** across a spectrum from heavy schema changes to zero-change behavioral approaches. They are not mutually exclusive — several compose well together.

**Key Findings:**

- **Option 2 (Agent-scoped join tables)** is the most robust persistent solution — it follows existing codebase patterns exactly and supports M:N relationships.
- **Option 6 (Agent-side eval config)** is the simplest persistent solution — a single jsonb column on the agents table — but lacks referential integrity.
- **Option 8 (Trigger-level input)** is the best zero-schema-change option for immediate use — the UI passes dataset/evaluator IDs when triggering the improvement, with no core model changes.
- **Option 5 (Ask the user)** is the fastest to implement (prompt change only) but adds friction to the automated improvement loop.
- Options 3, 4, 7, and 10 have significant limitations that make them unsuitable as primary mechanisms.

---

## Research Rubric

| # | Dimension | Priority |
|---|-----------|----------|
| 1 | Option: Direct FK on dataset/evaluator | P0 |
| 2 | Option: Agent-scoped join tables | P0 |
| 3 | Option: Extend datasetRunConfig as canonical binding | P0 |
| 4 | Option: Evaluation suite config as scoping mechanism | P0 |
| 5 | Option: Interactive selection (ask user in chat) | P0 |
| 6 | Option: Agent-side eval config (jsonb on agents table) | P0 |
| 7 | Option: Infer from historical runs | P0 |
| 8 | Option: Trigger-level input (UI-driven selection) | P0 |
| 9 | Option: Hybrid infer + confirm | P1 |
| 10 | Option: Convention/naming-based resolution | P1 |
| 11 | Migration & backward compatibility | P0 |
| 12 | Improvement agent consumption | P0 |
| 13 | UI impact on manage-ui | P1 |

**Stance:** Factual — options enumerated and analyzed, no final recommendation.

---

## Detailed Findings

### Option 1: Direct FK on dataset/evaluator

**Finding:** Add an optional `agentId` column to `dataset` and `evaluator` tables.

**Evidence:** [evidence/schema-options.md](evidence/schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | Add nullable `agentId` VARCHAR(256) + FK to `agents` on both `dataset` and `evaluator` tables |
| Migration | Additive — existing rows get NULL (= project-wide, unscoped) |
| Cardinality | **1:1 only** — a dataset can belong to at most one agent |
| Backward compat | Full — NULL means "available to all agents" (current behavior preserved) |
| Data access change | Add optional `agentId` param to `listDatasets` / `listEvaluators` |
| Agent consumption | `list-datasets?agentId=X` + `list-datasets?agentId=null` (get agent-specific + shared) |

**Implications:**
- Simplest schema change — one new column per table
- The 1:1 limitation is significant: if you have a general-purpose quality dataset useful for multiple agents, you either leave it unscoped (NULL) or duplicate it
- Follows the pattern of optional FK references elsewhere (e.g., `contextConfigId` on agents)

**Decision triggers:**
- This option works well if datasets/evaluators are almost always agent-specific
- Less suitable if datasets/evaluators are frequently shared across agents

---

### Option 2: Agent-scoped join tables

**Finding:** New many-to-many `agent_dataset_relations` and `agent_evaluator_relations` tables.

**Evidence:** [evidence/schema-options.md](evidence/schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | Two new tables following existing join table pattern |
| Migration | Additive — new tables only, no changes to existing tables |
| Cardinality | **M:N** — datasets/evaluators can be shared across agents |
| Backward compat | Full — unassigned datasets/evaluators remain accessible project-wide |
| Data access change | New `listDatasetsByAgent`, `listEvaluatorsByAgent` + relation CRUD |
| Agent consumption | Query agent relations → get scoped IDs → fall back to unscoped |

**Implications:**
- Follows the exact pattern of `datasetRunConfigAgentRelations`, `evaluationSuiteConfigEvaluatorRelations`, etc. — the codebase has 4+ existing join tables using this pattern
- Most flexible: a quality dataset can be assigned to agents A and B while agent C has its own specific dataset
- More tables to maintain but the pattern is well-established
- The API route for creating datasets/evaluators can accept optional `agentIds` array (same as `datasetRunConfigs` create route already does)

**Decision triggers:**
- Best option if datasets/evaluators will be shared across agents
- Slightly more complex than Option 1 but strictly more capable

---

### Option 3: Extend datasetRunConfig as canonical binding

**Finding:** Query existing `datasetRunConfig` + `datasetRunConfigAgentRelations` to infer which datasets belong to which agents.

**Evidence:** [evidence/schema-options.md](evidence/schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None |
| Migration | N/A |
| Backward compat | N/A |
| Data access change | New query: list run configs where agent relations include target agent → extract dataset IDs |
| Agent consumption | Complex multi-step: list configs → filter by agent → extract datasetId + evaluator associations |

**Implications:**
- Zero schema change — infrastructure already exists
- **Semantically wrong:** `datasetRunConfig` means "how to run a dataset" not "which datasets belong to an agent" — confusing to reason about
- **Cold start problem:** fails if no run configs exist yet for the target agent
- Run configs are created per-run by the Feedback Analyst, meaning the association only exists *after* the first run
- Multiple run configs may reference the same dataset with different agent sets

**Remaining uncertainty:**
- Not recommended as a primary mechanism due to semantic mismatch and cold start

---

### Option 4: Evaluation suite config as scoping mechanism

**Finding:** `evaluationSuiteConfig` already has `filters.agentIds` — could be extended to become the canonical agent ↔ eval binding.

**Evidence:** [evidence/schema-options.md](evidence/schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | Would need dataset relations added to suite configs |
| Migration | Additive |
| Backward compat | Filter logic currently not implemented (match-all) |
| Agent consumption | Query suite configs → find ones matching target agent → extract evaluator + dataset IDs |

**Implications:**
- The `agentIds` field exists in `EvaluationSuiteFilterCriteria` but the filter logic is **not implemented** (comment: "For now, we match all")
- Suite configs are designed for **conversation-based auto-eval** (trigger on conversation end), not for dataset runs — this would conflate two different evaluation modes
- Would require: (a) implement filter logic, (b) add dataset relations, (c) rethink suite config as a general-purpose binding
- Significant rework for a mechanism that doesn't naturally fit the use case

**Remaining uncertainty:**
- Not recommended due to conceptual misfit between suite configs and dataset run scoping

---

### Option 5: Interactive selection (ask user in chat)

**Finding:** The improvement agent presents available datasets/evaluators and asks the user to pick which ones to run before starting the baseline.

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None |
| Migration | N/A |
| Code change | Prompt change only in Feedback Analyst |
| Agent consumption | List all → present to user → wait for response → use selected |

**Implications:**
- **Fastest to implement** — literally a prompt change in `feedback-analyst.ts`
- Adds a conversational round-trip to what's meant to be an automated workflow
- User may not know which datasets/evaluators are relevant (they were created at different times)
- **Breaks autonomous/trigger-based improvement loops** where no user is present to answer
- In single-agent projects, still asks a question with an obvious answer
- Works well for **ad-hoc improvement runs** where the user has specific context

**Decision triggers:**
- Good as a short-term solution or fallback
- Not suitable if the goal is fully autonomous improvement loops

---

### Option 6: Agent-side eval config (jsonb on agents table)

**Finding:** Store dataset/evaluator IDs on the agent record itself as a jsonb field.

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | Add `evalConfig` jsonb column to `agents` table |
| Migration | Additive — nullable column, existing agents get NULL |
| Backward compat | Full — NULL = no eval config (current behavior) |
| Data access change | None for eval entities; agent get/update includes new field |
| Agent consumption | Get agent → read evalConfig → use those IDs |

**Implications:**
- Follows the existing pattern of jsonb config fields on agents (`models`, `statusUpdates`, `stopWhen`)
- Agent "owns" its eval configuration — natural ownership model
- **Simplest persistent approach** — single column addition
- **Risk:** no referential integrity — if a dataset is deleted, its ID stays in the jsonb until cleaned up (requires application-level cleanup or a periodic reconciliation)
- SDK `agent()` builder would need a new `evalConfig` option
- UI: add eval config section to agent edit/settings page

**Decision triggers:**
- Good if you want simple, agent-centric ownership
- Risk is acceptable if you trust application-level cleanup (or implement it)
- Less suitable if referential integrity is critical

---

### Option 7: Infer from historical runs

**Finding:** Mine past `datasetRunConfigAgentRelations` and runtime `datasetRun` records to discover which datasets/evaluators have been used with the target agent.

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None |
| Migration | N/A |
| Code change | New cross-table query logic + Feedback Analyst prompt change |
| Agent consumption | Query historical data → extract unique dataset/evaluator sets |

**Implications:**
- Zero schema change
- **Cold start problem:** fails completely for agents that have never been evaluated
- Historical associations may be stale (datasets deleted, evaluators changed)
- Requires complex cross-table joins not currently implemented
- **Best as a heuristic/fallback**, not a primary mechanism

---

### Option 8: Trigger-level input (UI-driven selection)

**Finding:** Pass dataset/evaluator IDs in the trigger payload from the manage-ui when invoking the improvement workflow.

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None to core entities; extend trigger input schema |
| Migration | N/A |
| Code change | Trigger schema + UI picker + Feedback Analyst prompt |
| Agent consumption | Read IDs from trigger input → skip discovery → use directly |

**Implications:**
- Zero schema change to core entities (datasets, evaluators, agents)
- Extends the trigger's `inputSchema` with optional `datasetIds`, `evaluatorIds`, `targetAgentId`
- UI adds dataset/evaluator multi-select pickers to the feedback improvement dialog
- **Explicit:** user sees exactly what will be evaluated before triggering
- **Optional:** if not provided, agent falls back to current behavior
- Does NOT solve persistent association — it's per-invocation
- The feedback table UI currently doesn't even pass `targetAgentId` — this would fix that too

**Decision triggers:**
- Best zero-schema option for immediate use
- Does not create persistent agent ↔ eval associations (every invocation requires selection)
- Pairs well with Options 2 or 6 (persistent association provides defaults; trigger input allows overrides)

---

### Option 9: Hybrid infer + confirm

**Finding:** Combine historical inference with lightweight user confirmation.

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None |
| Code change | Inference logic + Feedback Analyst prompt |
| Agent consumption | Check history → propose selection → confirm → use |

**Implications:**
- Smart first impression — learns from prior runs
- Degrades gracefully to asking when no history exists
- Still adds a conversational round-trip
- Does not create persistent associations

---

### Option 10: Convention/naming-based resolution

**Finding:** Resolve datasets/evaluators to agents by parsing naming conventions (e.g., `qa-agent-dataset-1`).

**Evidence:** [evidence/non-schema-options.md](evidence/non-schema-options.md)

| Aspect | Assessment |
|--------|-----------|
| Schema change | None |
| Code change | Naming convention parsing in Feedback Analyst |

**Implications:**
- Extremely fragile — breaks if convention not followed
- No enforcement mechanism
- Doesn't scale to renamed agents
- Only viable as a last-resort heuristic

---

## Comparison Matrix

| Option | Schema Change | Migration Risk | M:N Support | Cold Start | Persistence | User Friction | Autonomous-Ready |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1. Direct FK | Yes (2 cols) | Low | No (1:1) | N/A | Yes | None | Yes |
| 2. Join tables | Yes (2 tables) | Low | **Yes** | N/A | Yes | None | Yes |
| 3. datasetRunConfig | None | N/A | Via config | **Fails** | Implicit | None | Partial |
| 4. Suite config | Yes (extend) | Medium | Partial | N/A | Yes | None | Yes |
| 5. Ask user | None | N/A | N/A | N/A | No | **High** | **No** |
| 6. Agent eval config | Yes (1 col) | Low | Via arrays | N/A | Yes | None | Yes |
| 7. Historical inference | None | N/A | N/A | **Fails** | No | None | Partial |
| 8. Trigger input | None (trigger only) | None | N/A | N/A | No | **Low** | Partial |
| 9. Hybrid infer+confirm | None | N/A | N/A | Degrades | No | **Medium** | **No** |
| 10. Naming convention | None | N/A | N/A | N/A | No | None | Yes (fragile) |

---

## Composability: Options That Work Well Together

Several options compose naturally:

| Combination | Why it works |
|-------------|-------------|
| **2 + 8** | Join tables provide persistent defaults; trigger input allows per-invocation overrides |
| **6 + 8** | Agent config provides persistent defaults; trigger input allows overrides |
| **6 + 5** | Agent config provides defaults; ask user when config is empty or ambiguous |
| **2 + 7** | Join tables are the source of truth; historical inference populates suggestions for agents not yet configured |
| **8 + 5** | UI provides selection at trigger time; agent asks in chat if none provided |

---

## Migration & Backward Compatibility

| Option | What happens to existing data | Breaking? |
|--------|-------------------------------|-----------|
| 1 (Direct FK) | Existing datasets/evaluators get NULL agentId (= project-wide) | No |
| 2 (Join tables) | New empty tables; unassigned resources remain project-wide | No |
| 3 (datasetRunConfig) | No change | N/A |
| 4 (Suite config) | Needs filter implementation; existing configs unaffected | No |
| 5 (Ask user) | No change | N/A |
| 6 (Agent config) | Existing agents get NULL evalConfig | No |
| 7 (Historical) | No change | N/A |
| 8 (Trigger input) | Trigger schema extended; existing invocations unaffected | No |
| 9 (Hybrid) | No change | N/A |
| 10 (Naming) | No change | N/A |

All options are additive with full backward compatibility. None require data migration of existing rows.

---

## Improvement Agent Consumption

How the Feedback Analyst's workflow would change for each option:

**Options 1, 2 (persistent schema-based):**
```
Current:  list-datasets (all) → list-evaluators (all) → use all
Proposed: list-datasets?agentId=X → list-evaluators?agentId=X → use scoped + unscoped
```
API gets a filter param. Agent uses it automatically. No conversational friction.

**Option 6 (agent-side config):**
```
Current:  list-datasets (all) → list-evaluators (all) → use all
Proposed: get-agent X → read evalConfig.datasetIds → read evalConfig.evaluatorIds → use those
```
Agent reads its own config. No list call needed if config is populated.

**Option 8 (trigger input):**
```
Current:  trigger fires → agent lists all → uses all
Proposed: trigger fires with datasetIds + evaluatorIds → agent reads from input → uses those
```
Selection happens before the agent starts.

**Option 5 (ask user):**
```
Current:  list all → use all
Proposed: list all → present to user → wait → use selected
```
Conversational round-trip added.

---

## UI Impact on manage-ui

| Option | UI Changes Needed |
|--------|-------------------|
| 1 (Direct FK) | Agent selector dropdown on dataset/evaluator create/edit forms |
| 2 (Join tables) | Agent multi-select on dataset/evaluator pages (or agent settings page with dataset/evaluator assignment) |
| 5 (Ask user) | None |
| 6 (Agent config) | Eval config section on agent edit/settings page with dataset/evaluator pickers |
| 8 (Trigger input) | Dataset/evaluator multi-select pickers on feedback improvement dialog |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Authorization impact:** How does agent scoping interact with fine-grained permissions (SpiceDB)? Not explored — would need assessment if agent-level eval permissions are needed.
- **SDK builder ergonomics:** How exactly would `agent()` builder expose eval config? Needs design pass.
- **Bulk migration tooling:** If adopting Option 2, should there be a one-time tool to help users assign existing datasets/evaluators to agents?

### Out of Scope (per Rubric)
- Implementing any of these options
- Cross-tenant or cross-project scoping
- Evaluator prompt/schema design

---

## References

### Evidence Files
- [evidence/current-state.md](evidence/current-state.md) - Current dataset/evaluator scoping model
- [evidence/improvement-agent-workflow.md](evidence/improvement-agent-workflow.md) - Feedback Analyst workflow and selection logic
- [evidence/schema-options.md](evidence/schema-options.md) - Schema-based options analysis (Options 1-4)
- [evidence/non-schema-options.md](evidence/non-schema-options.md) - Non-schema options analysis (Options 5-10)
