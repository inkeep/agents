# @inkeep/agents-api

## 0.42.0

### Minor Changes

- ad01cd7: Add triggers API endpoints for CRUD operations on trigger configurations and viewing invocation history
- 0893319: Add multi-part message format for triggers: messages now include both text part (from messageTemplate) and data part (transformed payload) for richer context
- 82afd5b: Hash trigger authentication header values before storing in database using new headers array format
- 82afd5b: Update webhook handler to use async trigger authentication verification with new headers format
- a210291: Doltgres migration and evaluation system.
- ad01cd7: Add webhook endpoint for trigger invocations with support for authentication, payload validation, output transformation, and async agent execution

### Patch Changes

- 3940062: added extra prompting optionally to mcp tools
- 00fbaec: output schema filtering for evals
- b336b0e: Fix bug with agent name and description not updating
- 44461fe: trace default
- 14041da: pagination fix
- 568c1b2: added timestamp
- 9123640: feat(api): use ?raw query in tsdown
- c422f89: bug fix for user message evals
- 4c65924: process attributes removed
- b241c06: vercel workflow
- 3e656cd: simple refactor to reorder models
- 2d0d77a: Add ability to edit name and description from agent card
- dc827b0: improve context breakdown
- fabca13: add lint script for run-api and fix lint errors
- Updated dependencies [3940062]
- Updated dependencies [00fbaec]
- Updated dependencies [91dad33]
- Updated dependencies [44461fe]
- Updated dependencies [4f7f0d2]
- Updated dependencies [14041da]
- Updated dependencies [568c1b2]
- Updated dependencies [c422f89]
- Updated dependencies [a210291]
- Updated dependencies [4c65924]
- Updated dependencies [b241c06]
- Updated dependencies [3e656cd]
- Updated dependencies [0893319]
- Updated dependencies [ad01cd7]
- Updated dependencies [dc827b0]
- Updated dependencies [82afd5b]
- Updated dependencies [82afd5b]
  - @inkeep/agents-core@0.42.0
  - @inkeep/agents-manage-mcp@0.42.0
