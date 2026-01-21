# PRD: Schema-Driven Code Generation for Pull Command

## Introduction

Replace the current entity-specific generator modules in `agents-cli/src/commands/pull-v3/` with a unified schema-driven code generation system. Currently, 13+ generator files follow similar patterns but duplicate logic for handling fields, imports, and formatting. When entity schemas change in `agents-core`, each generator must be manually updated—a process that's error-prone and doesn't scale.

This PRD proposes deriving code generation logic directly from Zod schemas and TypeScript types, ensuring that schema changes automatically propagate to generated code without manual generator updates.

## Goals

- Eliminate manual generator updates when entity schemas change
- Ensure 100% consistency in code generation patterns across all entity types
- Reduce total generator code by 60%+ through shared schema introspection
- Maintain functional equivalence with current output (minor formatting differences acceptable)
- Provide type-safe mapping between Zod schemas and generated TypeScript code
- Support all 13+ current entity types: agents, sub-agents, triggers, credentials, tools (MCP), function tools, data components, artifact components, status components, external agents, context configs, environments, and project

## User Stories

### US-001: Create Schema Introspection Engine
**Description:** As a developer, I need a core engine that can introspect Zod schemas and extract field metadata so that code generation can be driven by schema definitions.

**Acceptance Criteria:**
- [ ] Engine can parse any Zod schema and extract: field names, types, optionality, defaults, descriptions
- [ ] Handles nested objects, arrays, unions, and discriminated unions
- [ ] Extracts `.describe()` and `.openapi()` metadata from schema fields
- [ ] Detects nullable vs optional fields correctly
- [ ] Provides typed output for downstream code generation
- [ ] Unit tests cover all Zod schema types used in agents-core
- [ ] Typecheck passes

### US-002: Define Code Generation Annotations
**Description:** As a developer, I need a way to annotate schema fields with code generation hints so that the generator knows how to render each field type.

**Acceptance Criteria:**
- [ ] Create `CodeGenAnnotation` type with properties: `renderAs`, `importFrom`, `variableNamePrefix`, `omitIfDefault`, `templateVariable`
- [ ] Annotations can be attached to Zod schemas via `.meta()` or a separate registry
- [ ] Support annotation inheritance (field-level overrides type-level defaults)
- [ ] Document all supported annotation options
- [ ] Typecheck passes

### US-003: Build Field Renderer Registry
**Description:** As a developer, I need a registry of field renderers that know how to convert schema field types to TypeScript code so that rendering logic is centralized and reusable.

**Acceptance Criteria:**
- [ ] Create renderers for: string, number, boolean, array, object, enum, union, reference (to other components)
- [ ] Each renderer accepts field metadata and returns formatted TypeScript code string
- [ ] Renderers respect CodeStyle settings (quotes, semicolons, indentation)
- [ ] Reference renderer integrates with ComponentRegistry for variable names and imports
- [ ] Template variable renderer handles `{{placeholder}}` conversion to template literals
- [ ] Unit tests for each renderer type
- [ ] Typecheck passes

### US-004: Implement Entity-to-Builder Mapping
**Description:** As a developer, I need mappings from entity schema types to SDK builder functions so that generated code uses the correct builder (e.g., `agent()`, `subAgent()`, `credential()`).

**Acceptance Criteria:**
- [ ] Create mapping configuration for all 13+ entity types to their SDK builders
- [ ] Mapping includes: builder function name, import path, required fields, optional fields
- [ ] Support for entities that use `new Class()` syntax (e.g., `new Trigger()`) vs function builders
- [ ] Mapping handles entities with no builder (e.g., environments use `registerEnvironmentSettings()`)
- [ ] Typecheck passes

### US-005: Generate Agent Definitions from Schema
**Description:** As a developer, I want agent code to be generated from `AgentWithinContextOfProjectSchema` so that agent field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `agent()` builder from SDK
- [ ] Handles all agent fields: name, description, defaultSubAgent, subAgents, models, statusUpdates, prompt, stopWhen, triggers, contextConfig
- [ ] Correctly references sub-agents, triggers, and context config via ComponentRegistry
- [ ] Model comparison with project-level models (only includes overrides)
- [ ] Template variables in prompts converted to `${contextVar.toTemplate("field")}`
- [ ] Output functionally equivalent to current `agent-generator.ts`
- [ ] Typecheck passes

### US-006: Generate Sub-Agent Definitions from Schema
**Description:** As a developer, I want sub-agent code to be generated from `FullAgentAgentInsertSchema` so that sub-agent field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `subAgent()` builder from SDK
- [ ] Handles all sub-agent fields: name, description, prompt, canUse, canTransferTo, canDelegateTo, dataComponents, artifactComponents, models, stopWhen
- [ ] Model comparison with parent agent (only includes overrides)
- [ ] Correctly references tools, function tools, data components, artifact components, external agents
- [ ] Output functionally equivalent to current `sub-agent-generator.ts`
- [ ] Typecheck passes

### US-007: Generate Trigger Definitions from Schema
**Description:** As a developer, I want trigger code to be generated from `TriggerApiInsertSchema` so that trigger field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `new Trigger()` constructor
- [ ] Handles all trigger fields: name, description, enabled, inputSchema, outputTransform, messageTemplate, authentication
- [ ] Authentication headers rendered with environment variable references
- [ ] Output transforms support both jmespath and objectTransformation
- [ ] Input schema converted from JSON Schema to Zod using json-schema-to-zod
- [ ] Output functionally equivalent to current `trigger-generator.ts`
- [ ] Typecheck passes

### US-008: Generate Credential Definitions from Schema
**Description:** As a developer, I want credential code to be generated from `CredentialReferenceApiInsertSchema` so that credential field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `credential()` builder
- [ ] Handles all credential fields: name, type (CredentialStoreType enum), credentialStoreId, retrievalParams
- [ ] Retrieval params rendered correctly for different credential store types
- [ ] Output functionally equivalent to current `credential-generator.ts`
- [ ] Typecheck passes

### US-009: Generate Tool Definitions from Schema
**Description:** As a developer, I want MCP tool code to be generated from `ToolApiInsertSchema` so that tool field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `mcpTool()` builder
- [ ] Handles all tool fields: name, description, config (MCP server settings), credentialReferenceId, headers, capabilities
- [ ] Transport configuration (stdio, sse, streamableHttp) rendered correctly
- [ ] Credential references resolved via ComponentRegistry
- [ ] Output functionally equivalent to current `mcp-tool-generator.ts`
- [ ] Typecheck passes

### US-010: Generate Function Tool Definitions from Schema
**Description:** As a developer, I want function tool code to be generated from merged `FunctionToolApiInsertSchema` and `FunctionApiInsertSchema` so that function tool field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `functionTool()` builder
- [ ] Merges function tool metadata with function code (inputSchema, executeCode, dependencies)
- [ ] Input schema converted from JSON Schema to Zod
- [ ] Execute code rendered as function body
- [ ] Dependencies array rendered for imports
- [ ] Output functionally equivalent to current `function-tool-generator.ts`
- [ ] Typecheck passes

### US-011: Generate Component Definitions from Schema
**Description:** As a developer, I want data/artifact/status component code to be generated from their respective schemas so that component field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript for dataComponent(), artifactComponent(), and status components
- [ ] Props schema converted from JSON Schema to Zod
- [ ] Artifact components handle `inPreview: true` fields with `preview()` wrapper
- [ ] Status components render detailsSchema correctly
- [ ] Output functionally equivalent to current component generators
- [ ] Typecheck passes

### US-012: Generate External Agent Definitions from Schema
**Description:** As a developer, I want external agent code to be generated from `ExternalAgentApiInsertSchema` so that external agent field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `externalAgent()` builder
- [ ] Handles all fields: name, description, baseUrl, credentialReferenceId
- [ ] Credential references resolved via ComponentRegistry
- [ ] Output functionally equivalent to current `external-agent-generator.ts`
- [ ] Typecheck passes

### US-013: Generate Context Config Definitions from Schema
**Description:** As a developer, I want context config code to be generated from `ContextConfigApiInsertSchema` so that context config field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `contextConfig()` builder
- [ ] Handles all fields: headersSchema, contextVariables (fetch definitions)
- [ ] Fetch definitions rendered with proper URL, method, headers, response mapping
- [ ] Headers schema converted to Zod
- [ ] Output functionally equivalent to current `context-config-generator.ts`
- [ ] Typecheck passes

### US-014: Generate Environment Definitions from Schema
**Description:** As a developer, I want environment code to be generated so that environment field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `registerEnvironmentSettings()`
- [ ] Renders environment name, credential mappings
- [ ] Generates index.ts that exports all environments as array
- [ ] Output functionally equivalent to current `environment-generator.ts`
- [ ] Typecheck passes

### US-015: Generate Project Index from Schema
**Description:** As a developer, I want the project index.ts to be generated from `FullProjectDefinitionSchema` so that project field changes automatically reflect in generated code.

**Acceptance Criteria:**
- [ ] Generates valid TypeScript using `project()` builder
- [ ] Handles all fields: name, models, stopWhen, agents array, tools array, etc.
- [ ] All component imports resolved via ComponentRegistry
- [ ] Output functionally equivalent to current `project-generator.ts`
- [ ] Typecheck passes

### US-016: Integrate Schema-Driven Generators into Introspect Flow
**Description:** As a developer, I want the introspect-generator.ts to use the new schema-driven generators so that the pull command uses the unified system.

**Acceptance Criteria:**
- [ ] Replace all direct generator calls with schema-driven generator calls
- [ ] Maintain same file output structure (agents/, tools/, credentials/, etc.)
- [ ] ComponentRegistry integration preserved
- [ ] Validation and error messages preserved
- [ ] Debug output preserved
- [ ] All existing pull-v3 tests pass
- [ ] Typecheck passes

### US-017: Add Schema Change Detection Tests
**Description:** As a developer, I want tests that verify generated code stays in sync with schema changes so that we catch schema drift early.

**Acceptance Criteria:**
- [ ] Snapshot tests for each entity type's generated output
- [ ] Test that adding a new field to a schema results in that field appearing in generated code
- [ ] Test that removing a field from a schema removes it from generated code
- [ ] Test that changing field type updates generated code appropriately
- [ ] CI pipeline runs these tests on schema changes
- [ ] Typecheck passes

### US-018: Document Schema-Driven Generator Architecture
**Description:** As a developer, I want documentation explaining how to add new entity types and modify existing ones so that the system remains maintainable.

**Acceptance Criteria:**
- [ ] Architecture overview document in agents-cli/src/commands/pull-v3/README.md
- [ ] Instructions for adding a new entity type
- [ ] Instructions for adding code generation annotations to schemas
- [ ] Examples of common customization patterns
- [ ] Troubleshooting guide for generation issues

## Functional Requirements

- FR-1: The schema introspection engine must support all Zod schema types used in agents-core: z.string(), z.number(), z.boolean(), z.array(), z.object(), z.enum(), z.union(), z.discriminatedUnion(), z.nullable(), z.optional(), z.default()
- FR-2: Code generation annotations must be definable either inline via `.meta()` or in a separate annotation registry file
- FR-3: Field renderers must produce identical output for equivalent inputs regardless of which entity they're rendering
- FR-4: The ComponentRegistry must remain the single source of truth for variable names and import paths
- FR-5: Generated code must be valid TypeScript that passes strict type checking
- FR-6: Generated code must be functionally equivalent to current generators (same runtime behavior)
- FR-7: The system must handle circular references between entities (e.g., agents reference sub-agents, sub-agents reference tools)
- FR-8: Template variables (`{{placeholder}}`) in string fields must be detected and converted to template literal syntax
- FR-9: JSON Schema fields must be converted to Zod schemas using json-schema-to-zod library
- FR-10: Model configuration must support comparison with parent-level models to only include overrides
- FR-11: The system must preserve all current validation (agent completeness, required fields, etc.)
- FR-12: Error messages must clearly indicate which schema field caused generation failure

## Non-Goals

- Runtime code execution or evaluation of generated code during generation
- Automatic migration of existing generated code to new format
- GUI or visual editor for schema annotations
- Support for non-TypeScript output languages
- Automatic generation of SDK builder functions from schemas (builders remain hand-written)
- Code formatting with external tools (Prettier/ESLint) - internal formatting only
- Support for custom Zod plugins beyond standard library

## Technical Considerations

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     introspect-generator.ts                      │
│                    (orchestrates generation)                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SchemaCodeGenerator                            │
│  - Takes entity data + schema + annotations                      │
│  - Returns generated TypeScript code                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌───────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ SchemaIntrospector│ │ AnnotationStore │ │  FieldRendererReg   │
│ - Parse Zod schema│ │ - Entity→Builder│ │  - string renderer  │
│ - Extract metadata│ │ - Field hints   │ │  - array renderer   │
│ - Detect types    │ │ - Import paths  │ │  - reference render │
└───────────────────┘ └─────────────────┘ └─────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ComponentRegistry                            │
│            (existing - manages names & imports)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files to Modify

- `agents-cli/src/commands/pull-v3/introspect-generator.ts` - Use new generators
- `agents-cli/src/commands/pull-v3/components/*.ts` - Replace with thin wrappers or remove
- `agents-cli/src/commands/pull-v3/utils/component-registry.ts` - Extend if needed

### Key Files to Create

- `agents-cli/src/commands/pull-v3/schema-gen/introspector.ts` - Schema parsing
- `agents-cli/src/commands/pull-v3/schema-gen/annotations.ts` - Annotation definitions
- `agents-cli/src/commands/pull-v3/schema-gen/renderers.ts` - Field renderers
- `agents-cli/src/commands/pull-v3/schema-gen/generator.ts` - Main generator class
- `agents-cli/src/commands/pull-v3/schema-gen/entity-configs.ts` - Entity-to-builder mappings

### Dependencies

- `zod` - Already used, need to introspect schema internals via `._def`
- `json-schema-to-zod` - Already used for JSON Schema conversion
- `@inkeep/agents-core` - Source of Zod schemas
- `@inkeep/agents-sdk` - Source of builder function types

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Zod internal API changes | Pin Zod version, add abstraction layer over `._def` access |
| Edge cases in schema introspection | Extensive unit tests, fallback to manual rendering |
| Performance regression | Benchmark generation time, cache schema introspection results |
| Breaking changes to generated code | Snapshot tests, side-by-side comparison in PR reviews |

## Success Metrics

- Schema field additions require zero generator code changes
- Generator codebase reduced by 60%+ (measured by lines of code)
- All existing pull-v3 tests pass without modification
- Generation time within 10% of current performance
- Zero type errors in generated code

## Open Questions

1. Should annotations live in agents-core alongside schemas, or in agents-cli? (Tradeoff: coupling vs. co-location)
2. Should we support a "escape hatch" for entities that need custom generation logic that can't be expressed via annotations?
3. How should we handle fields that exist in the schema but should never appear in generated code (e.g., internal timestamps)?
4. Should the schema introspection engine be extracted to a separate package for reuse in other tools?
