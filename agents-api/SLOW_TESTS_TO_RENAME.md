# Slow Tests to Rename

This file lists test files in agents-api that should be renamed from `*.test.ts` to `*.slow.test.ts` because they use database operations (PGlite/createTestClient) or have long-running setup hooks.

## Identified Slow Tests

### CRUD Route Tests (Use Database Clients)
These tests use `createTestManageDatabaseClient` or `createTestRuntimeDatabaseClient`:

1. `src/__tests__/manage/routes/crud/agent.test.ts` - Uses database for agent CRUD operations
2. `src/__tests__/manage/routes/crud/agentFull.test.ts` - Uses database for full agent operations
3. `src/__tests__/manage/routes/crud/apiKeys.test.ts` - Uses database for API key operations
4. `src/__tests__/manage/routes/crud/artifactComponents.test.ts` - Uses database for artifact components
5. `src/__tests__/manage/routes/crud/contextConfigs.test.ts` - Uses database for context configs
6. `src/__tests__/manage/routes/crud/credentialReferences.test.ts` - Uses database for credential refs
7. `src/__tests__/manage/routes/crud/credentialStores.test.ts` - Uses database for credential stores
8. `src/__tests__/manage/routes/crud/dataComponents.test.ts` - Uses database for data components
9. `src/__tests__/manage/routes/crud/externalAgents.test.ts` - Uses database for external agents
10. `src/__tests__/manage/routes/crud/subAgents.test.ts` - Uses database for sub-agents
11. `src/__tests__/manage/routes/crud/subAgentArtifactComponents.test.ts` - Uses database
12. `src/__tests__/manage/routes/crud/subAgentDataComponents.test.ts` - Uses database
13. `src/__tests__/manage/routes/crud/subAgentExternalAgentRelations.test.ts` - Uses database
14. `src/__tests__/manage/routes/crud/subAgentRelations.test.ts` - Uses database
15. `src/__tests__/manage/routes/crud/subAgentTeamAgentRelations.test.ts` - Uses database
16. `src/__tests__/manage/routes/crud/subAgentToolRelations.test.ts` - Uses database
17. `src/__tests__/manage/routes/crud/tool-credential-integration.test.ts` - Uses database
18. `src/__tests__/manage/routes/crud/tools.test.ts` - Uses database for tool operations
19. `src/__tests__/manage/routes/crud/triggers.test.ts` - Uses database for triggers

### Evaluation CRUD Tests (Use Database Clients)
20. `src/__tests__/manage/routes/crud/evals/datasetItems.test.ts` - Uses database
21. `src/__tests__/manage/routes/crud/evals/datasetRunConfigs.test.ts` - Uses database
22. `src/__tests__/manage/routes/crud/evals/datasetRuns.test.ts` - Uses database
23. `src/__tests__/manage/routes/crud/evals/datasets.test.ts` - Uses database
24. `src/__tests__/manage/routes/crud/evals/evaluationJobConfigs.test.ts` - Uses database
25. `src/__tests__/manage/routes/crud/evals/evaluationResults.test.ts` - Uses database
26. `src/__tests__/manage/routes/crud/evals/evaluationRunConfigs.test.ts` - Uses database
27. `src/__tests__/manage/routes/crud/evals/evaluationSuiteConfigs.test.ts` - Uses database
28. `src/__tests__/manage/routes/crud/evals/evaluators.test.ts` - Uses database

### Data Layer Tests (Use Database Clients)
29. `src/__tests__/manage/data/agentFull.test.ts` - Uses database for data operations
30. `src/__tests__/manage/data/artifactComponents.test.ts` - Uses database
31. `src/__tests__/manage/data/dataComponentAssociations.test.ts` - Uses database
32. `src/__tests__/manage/data/ledgerArtifacts.test.ts` - Uses database
33. `src/__tests__/manage/data/conversations.test.ts` - Uses database

### Run Domain Tests (Use Database Clients)
34. `src/__tests__/run/routes/chat/dataChat.test.ts` - Uses database for chat operations
35. `src/__tests__/run/agents/delegationTaskCreation.test.ts` - Uses database for delegation

## Reason for Classification

These tests are considered "slow" because:
- They initialize PGlite in-memory databases
- They run database migrations in beforeAll/beforeEach hooks
- Database setup typically takes 1-5 seconds per test file
- They benefit from higher timeouts (60 seconds vs 5 seconds)

## Renaming Instructions

Use `git mv` to preserve history:
```bash
git mv src/__tests__/manage/routes/crud/agent.test.ts src/__tests__/manage/routes/crud/agent.slow.test.ts
```

After renaming, these tests will:
- Be excluded from `pnpm test:fast`
- Be included in `pnpm test:slow`
- Still run in `pnpm test` (full test suite)
