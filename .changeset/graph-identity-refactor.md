---
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-api": patch
"@inkeep/agents-cli": patch
---

Refactor agent graph editor to use deterministic graph keys and single source of truth for form state

### Graph identity system
- Add deterministic graph key derivation for all node types (`getSubAgentGraphKey`, `getMcpGraphKey`, `getFunctionToolGraphKey`, `getExternalAgentGraphKey`, `getTeamAgentGraphKey`) via new `graph-keys.ts`, `graph-identity.ts`, `sub-agent-identity.ts`, and `function-tool-identity.ts` modules
- Replace unstable `generateId()` UUIDs with stable, domain-meaningful identifiers derived from persisted IDs (relation IDs, tool IDs, agent IDs)
- URL-based sidepane selection now uses graph keys instead of raw React Flow IDs, so deep-links survive re-renders and saves

### RHF as single source of truth
- Strip `node.data` down to a thin identity envelope (`nodeKey` + minimal refs like `toolId`) — all business fields (name, description, prompt, models, code, etc.) are read exclusively from React Hook Form state
- Remove `hydrateNodesWithFormData()` entirely; `editorToPayload()` now reads all business data directly from a `SerializeAgentFormState` bundle with `requireFormValue()` fail-fast guards
- Rename `FullAgentUpdateSchema` → `FullAgentFormSchema`, remove `.transform()` from schema (resolution now happens at serialize-time), split types into `FullAgentFormValues` / `FullAgentFormInputValues`

### Connection state consolidation
- Collapse scattered `tempSelectedTools`/`tempHeaders`/`tempToolPolicies` on node data into `mcpRelations` and `functionToolRelations` RHF record maps with factory helpers (`createMcpRelationFormInput`, `createFunctionToolRelationFormInput`)
- Edge removal triggers synchronous `form.unregister()` instead of deferred `requestAnimationFrame` — only `relationshipId` is unregistered for MCP relations to avoid a race condition where headers would be set to empty string on removal
- Remove `subAgentId` manipulation from Zustand store's `onEdgesChange`

### Save-cycle reconciliation
- Expand `syncSavedAgentGraph` to reconcile three categories of server-assigned IDs: tool `canUse` relations, external agent delegate relations, and team agent delegate relations
- Rename MCP node IDs to deterministic graph keys post-save; preserve URL selection state via `findNodeByGraphKey`/`findEdgeByGraphKey`
- Collapse redundant double `isNodeType` patterns into single guards

### Bug fixes
- Fix function tool "requires approval" flag not persisting across save/reload by hydrating `needsApproval` tool policies from `canUse` relations back into form state during `apiToFormValues()`
- Fix model inheritance display: use `getModelInheritanceStatus()` instead of bare `!subAgent.models` check to correctly show "(inherited)" label
- Fix MCP node editor crash on deep-link/reload: consolidate null guards for `toolData`, `tool`, and `mcpRelation` with proper JSX fallback UI
- Fix function tool node editor crash after node removal: add early return when `functionId` is undefined
- Fix race condition when MCP relation is removed but component is still mounted

### Performance
- Replace `useWatch({ name: 'functionTools' })` with targeted `useWatch({ name: 'functionTools.${id}.functionId' })` to eliminate O(N²) re-renders across function tool nodes
- Remove `getFunctionIdForTool` helper that iterated the entire `functionTools` map

### Schema changes
- Rename form field `defaultSubAgentId` → `defaultSubAgentNodeId` to clarify it holds a node key; translation to persisted ID happens at serialization time
- Add `FunctionToolRelationSchema` and `functionToolRelations` record field to form schema
- OpenAPI: `defaultSubAgentId` uses `$ref` to `ResourceId`, `maxTransferCount` type corrected to `integer`, function tool `dependencies` simplified to `StringRecord`

### Test coverage
- Add 7 new test files covering graph identity, function tool identity, form-state defaults, and sync-saved-agent-graph scenarios
- Expand serialize and deserialize test suites with new architecture patterns
- Add roundtrip test for approval policy hydration
