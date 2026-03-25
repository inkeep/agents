# `pull-v4`

This document explains how `inkeep pull` is currently implemented in `agents-cli`, with a focus on the code under `src/commands/pull-v4/`.

## Entry points

- CLI registration lives in `agents-cli/src/index.ts`.
- The command implementation lives in `agents-cli/src/commands/pull-v4/introspect/index.ts`.
- The file generation pipeline lives in `agents-cli/src/commands/pull-v4/introspect-generator.ts`.
- Individual generation tasks live in `agents-cli/src/commands/pull-v4/generators/`.

## What `inkeep pull` does

`inkeep pull` fetches a full remote project definition, normalizes it, and regenerates the local TypeScript project from that definition.

At a high level:

1. Load CLI config and resolve authentication.
2. Resolve the target project directory and project ID.
3. Fetch `getFullProject(projectId)` from the management API.
4. Normalize the remote payload before generation.
5. Generate skill files, if the project has remote skills.
6. Run the TypeScript generator pipeline and write files to disk.

## Target directory resolution

The command supports three ways to decide where generated files go:

1. If the current working directory contains `index.ts`, it is treated as the local project root.
2. If `--project <value>` points to a directory that contains `index.ts`, that directory is used.
3. Otherwise `--project <value>` is treated as a project ID, and pull generates into `<cwd>/<project-id>`.

If you are already inside a project directory and also pass `--project`, the local project ID must match the flag value.

## Remote normalization before generation

Before writing files, `pull-v4` mutates the fetched project definition in a few important ways:

- Agent-level `functionTools` are hoisted to `project.functionTools`.
- Agent-level `functions` are hoisted to `project.functions` when a project-level function is not already present.
- Project-level tools are removed from each agent's inline `tools` object so the generated code imports shared tools instead of duplicating them.
- `canDelegateTo` string entries are enriched into typed references like `{ agentId }`, `{ subAgentId }`, or `{ externalAgentId }`.

If `--json` is passed, the command prints this normalized project JSON and exits without generating files.

## Generated layout

`createProjectStructure()` returns the canonical output layout:

- `index.ts`
- `agents/`
- `agents/sub-agents/`
- `agents/triggers/`
- `tools/`
- `data-components/`
- `artifact-components/`
- `status-components/`
- `credentials/`
- `context-configs/`
- `external-agents/`
- `environments/`
- `skills/`

Only the project root is created up front. Subdirectories are created lazily when `writeTypeScriptFile()` or `generateSkills()` writes a file.

## Current generator pipeline

The TypeScript pipeline is driven by `generationTasks` in `agents-cli/src/commands/pull-v4/generators/index.ts`.

For each task:

1. `collect(context)` returns one or more `{ id, filePath, payload }` records.
2. `generate(payload)` returns a `ts-morph` `SourceFile`.
3. `writeTypeScriptFile()` writes the result using `merge` or `overwrite` mode.

The current task order is:

1. credentials
2. environment settings
3. environment index
4. artifact components
5. data components
6. function tools
7. MCP tools
8. external agents
9. context configs
10. triggers
11. scheduled triggers
12. sub-agents
13. status components
14. agents
15. project index

Skills are not part of `generationTasks`. They are written separately by `generateSkills()` because they emit `SKILL.md` files instead of TypeScript source files.

## Merge behavior

`introspectGenerate()` defaults to `writeMode: 'merge'`.

In merge mode:

- Existing files are parsed into a `ComponentRegistry`.
- `GenerationResolver` uses that registry to preserve existing export names and file paths when possible.
- `mergeGeneratedModule()` merges generated content into the existing module.

After merge or overwrite, `writeTypeScriptFile()` also:

- applies object shorthand where possible,
- moves top-level variable declarations before earlier top-level usages,
- formats the generated source with `ts-morph`.

## CLI flags and their current effect

These are the flags exposed by `inkeep pull` today:

| Flag | Current effect |
| --- | --- |
| `--project <project-id>` | Uses a project ID or a path to a local project directory. |
| `--config <path>` | Uses a specific config file. |
| `--profile <name>` | Uses a specific CLI profile. |
| `--json` | Prints normalized remote project JSON and skips file generation. |
| `--debug` | Enables extra debug logging in the pull flow. |
| `--all` | Pulls all tenant projects into subdirectories under the current working directory. |
| `--tag <tag>` | Loads a tagged config file through the standard CLI config pipeline. |
| `--quiet` | Suppresses profile/config logging from the CLI pipeline. |
| `--env <environment>` | Parsed and shown in the success summary, but it does not currently change generated output. |
| `--verbose` | Parsed, but currently unused by `pull-v4`. |
| `--force` | Parsed, but currently unused by `pull-v4`. |

One other implementation detail: the pull command prints log lines that mention "smart comparison", but the current code path still ends by calling `introspectGenerate()` directly.

## How to add a new generator

### 1. Decide whether it belongs in `generationTasks`

Use a `GenerationTask` when:

- the output is TypeScript,
- the generator can be expressed as `collect(context) -> payload[]` and `generate(payload) -> SourceFile`,
- the file should participate in merge mode.

Do not use `generationTasks` when:

- the output is not TypeScript,
- generation is async and writes files directly,
- the new output behaves more like the existing `skill-generator`.

### 2. Create the generator file

Most generators follow one of two patterns:

- simple factory generator: one file contains both `generateXDefinition()` and `xGenerationTask`
- split collector: complex cases keep `generateXDefinition()` in one file and `xGenerationTask` in `*.collector.ts`

Minimal task shape:

```ts
export const myGenerationTask = {
  type: 'my-component',
  collect(context) {
    return [
      {
        id: 'my-id',
        filePath: context.resolver.resolveOutputFilePath(
          'myComponents',
          'my-id',
          join(context.paths.myComponentsDir, 'my-id.ts')
        ),
        payload: {
          myComponentId: 'my-id',
        } as Parameters<typeof generateMyDefinition>[0],
      },
    ];
  },
  generate: generateMyDefinition,
} satisfies GenerationTask<Parameters<typeof generateMyDefinition>[0]>;
```

Use `generateSimpleFactoryDefinition()` when the output is mostly a direct SDK factory call. Use `generateFactorySourceFile()` when you need custom imports, reference rewriting, or custom AST output.

### 3. Register the task

Add the new task to `agents-cli/src/commands/pull-v4/generators/index.ts`.

Place it where its consumers make sense. For example:

- generate referenced leaf components before files that import them,
- keep `projectGenerationTask` near the end,
- keep environment or shared dependency outputs before tools or agents that rely on them.

### 4. Add output paths

If the generator writes to a new top-level folder, update the project path types:

- `createProjectStructure()` in `agents-cli/src/commands/pull-v4/introspect/index.ts`
- `ProjectPaths` in `agents-cli/src/commands/pull-v4/generation-types.ts`
- test helpers such as `agents-cli/src/commands/pull-v4/introspect/test-helpers.ts`

### 5. Teach merge mode about the new component type

If the new generator should preserve existing file names or export names in merge mode, update the parser and registry plumbing:

- add the component type to `ComponentType` in `component-registry.ts`
- add it to `VALID_COMPONENT_TYPES` in `component-parser.ts` if it should be discoverable from existing files
- add a factory-name mapping to `FUNCTION_NAME_TO_TYPE` in `component-parser.ts` if it is created by a new SDK helper

If the new component participates in imports or cross-file references, you may also need to extend:

- `GenerationResolver`
- `collector-reference-helpers.ts`
- `reference-resolution.ts`

### 6. Handle naming and collisions

Prefer existing naming helpers instead of inventing a new naming scheme:

- `buildComponentFileName()`
- `buildSequentialNameFileNames()`
- `toCamelCase()`
- `toToolReferenceName()`
- `toCredentialReferenceName()`

If the new component is referenced by ID from other generators, decide whether you need:

- a generated reference name,
- a generated module path,
- merge-mode overrides from existing files.

That decision usually belongs in `GenerationResolver`.

### 7. Add tests

A new generator should usually add both unit coverage and pipeline coverage:

- a focused generator test in `agents-cli/src/commands/pull-v4/__tests__/`
- an introspect integration test in `agents-cli/src/commands/pull-v4/introspect/`

Add merge-specific regression tests when the new component:

- preserves hand-edited names,
- preserves hand-edited file locations,
- introduces new import/reference behavior,
- can collide with existing component names.

If the new component should appear in the baseline generated project layout, update the introspect fixture and snapshots used by `introspect/generation.test.ts`.

## Practical checklist for a new generator

- Add `generateXDefinition()`.
- Add `xGenerationTask`.
- Register it in `generators/index.ts`.
- Add a `ProjectPaths` entry if it needs a new directory.
- Update merge-mode parser/registry support if existing files should be preserved.
- Update resolver/reference helpers if other generated files import it.
- Add unit tests.
- Add introspect pipeline tests.

## Current caveats worth knowing

- The pull flow currently always uses the introspect generator path for TypeScript output.
- `--env` does not currently switch which environment file is generated.
- Environment generation is currently hard-coded to `development.env.ts` plus `environments/index.ts` when environment-backed credentials are present.
- Skills are generated outside the main `generationTasks` pipeline.
