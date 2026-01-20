# Spec Authoring Guide

## Overview

This document defines how specification files in the `spec/` directory should be written. These specs provide AI coding agents with focused context about specific features of the Inkeep Agent Framework.

## Key Concepts

### Purpose of Spec Files
Spec files are **living reference documents** that summarize architecture, decisions, and implementation patterns. They bridge the gap between high-level documentation and raw source code.

### Source of Truth
Code is always the source of truth. Specs summarize and point to relevant code—they don't replace it. When specs and code diverge, the code wins and the relevant spec must be updated to respect the code's supremacy.

### Audience
- **Primary**: AI coding agents working on this codebase
- **Secondary**: Humans who proofread and maintain these documents

Specs assume no prior knowledge of agent frameworks. Everything an AI agent needs to understand a feature should be contained within the spec files themselves or linked to related specs.

## File Organization

All specs live in the `spec/` directory. Each spec covers a single focused topic. Name files descriptively using kebab-case (e.g., `agent-execution-flow.md`, `mcp-integration.md`).

## Implementation Details

### Document Structure

Specs should include an **Overview** section. Beyond that, use whichever sections make sense for the topic. Here are common sections to consider:

- **Overview** (required): Brief description of what this feature is and why it matters
- **Key Concepts**: Core terminology and mental models
- **Architecture**: How components interact, with diagrams if helpful
- **Implementation Details**: Patterns, code references, key functions/classes with file paths
- **Common Operations**: Typical tasks and how to accomplish them
- **Gotchas & Edge Cases**: Non-obvious behaviors, debugging tips
- **Related Specs**: Links to related specification documents

Adapt the structure to fit the content. A simple feature may need only Overview and Implementation Details. A complex system may need all sections plus custom ones.

### Size Guidelines

| Guideline | Target |
|-----------|--------|
| Word count | 500-1500 words |
| Principle | Smaller is better, but maximize information density |
| When to split | If complexity grows, abstract into separate files |

Smaller specs enable selective context inclusion—an AI agent can load just the specs it needs rather than ingesting a monolithic document. However, small doesn't mean sparse. Pack useful information into each spec; avoid filler and redundancy. Every sentence should earn its place.

### Diagram Guidelines

Diagrams are optional. Only include them when they genuinely clarify relationships that are hard to express in prose.

**When diagrams help**: Complex data flows, component relationships, state machines, entity relationships.

**When to skip diagrams**: Simple linear processes, obvious hierarchies, anything easily described in a sentence or two.

**If you include diagrams, use Mermaid syntax**. Avoid ASCII diagrams—LLMs struggle with spatial pattern recognition since tokenization breaks ASCII art into meaningless fragments. Mermaid's structured DSL parses well for both AI agents and renders nicely for human review.

**Diagram best practices**:
- Keep diagrams focused—break large systems into smaller diagrams
- Place diagram code before textual explanation
- Use appropriate diagram types: `flowchart` for flows, `sequenceDiagram` for interactions, `erDiagram` for data models

### Writing Style

- **Be concise**: Short explanations of *what* exists with brief *why*
- **Reference file paths**: Always point to source files (e.g., `packages/agents-core/src/db/schema.ts:45`)
- **No historical archives**: These aren't ADRs—track current state, not decision history
- **Self-contained**: Define terms; don't assume prior knowledge

## Common Operations

### Creating a New Spec

1. Identify the feature or concept that needs documentation
2. Research the feature by reading relevant source code
3. Start with an Overview section explaining what and why
4. Add sections as needed, keeping total length under 1500 words
5. Include diagrams only if they genuinely clarify complex relationships
6. Reference specific file paths for implementation details
7. Link to related specs if applicable

### Updating an Existing Spec

1. Verify the code has actually changed
2. Update affected sections only
3. Ensure file path references are still valid
4. Keep the spec focused—split if it's grown too large

### Splitting a Large Spec

When a spec exceeds ~1500 words or covers multiple distinct concepts:

1. Identify the abstraction boundary
2. Create a new spec for the lower-level details
3. Update the parent spec to summarize and link to the new spec
4. Maintain the abstraction hierarchy

## Gotchas & Edge Cases

- **Mermaid syntax validation**: Claude may occasionally produce invalid Mermaid. Use `mmdc` (Mermaid CLI) or preview in GitHub to verify.
- **Stale file paths**: When code moves, specs need updating. Consider grepping for referenced paths during maintenance.
- **Over-documenting**: Resist the urge to document everything. If something is obvious from the code, a brief mention suffices.

## Related Resources

- `AGENTS.md` - Comprehensive operational guide for AI coding agents working on this codebase
- `agents-docs/content/` - User-facing documentation (different audience than specs)
