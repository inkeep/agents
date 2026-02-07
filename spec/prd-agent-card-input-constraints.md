# PRD: Agent Card Input Constraints Extension

## Overview

**Status:** Draft  
**Author:** Andrew  
**Created:** 2026-02-05  
**Branch:** `feat/agent-card-input-constraints`

## Problem Statement

The A2A protocol's Agent Card currently only expresses input/output support via MIME types (e.g., `image/png`, `image/jpeg`). UI clients and consuming agents have no standardized way to discover:

- Maximum file sizes
- Maximum number of files per request
- Image dimension limits
- Text/token limits
- Per-format constraints

This leads to:

1. **Poor UX**: Users attempt uploads that fail with cryptic errors
2. **Wasted resources**: Large files are transmitted only to be rejected
3. **Guesswork**: Clients must hardcode assumptions or discover limits through trial-and-error

## Proposed Solution

Add an `inputConstraints` extension to the Agent Card that declaratively advertises input limitations, allowing clients (specifically the chat widget) to validate inputs client-side before sending.

This follows the A2A protocol's extension mechanism, placing constraint data in `capabilities.extensions` with a versioned URI identifier.

## Design Decisions

### Scope

- **Files**: Size limits, count limits, dimension limits, per-MIME-type constraints
- **Text**: Character limits, token limits (optional)
- **All fields are optional**: Agents only advertise what they know

### Granularity

- **Agent-level only** for v1 (not per-skill)
- Rationale: Keeps implementation simple; skill-level can be added later if needed

### Placement

- **A2A Extension** in `capabilities.extensions` array
- URI: `https://inkeep.com/a2a-extensions/input-constraints/v1`
- Follows A2A spec extension format with `uri`, `description`, `required`, and `params`

### Constraint Derivation

Constraints may come from multiple sources:
- Model limits (e.g., Claude supports 20 images, max 5MB each)
- Provider limits (API-specific)
- Infrastructure limits (gateway request size)
- Agent-specific configuration

For v1, agents **explicitly configure** their constraints. Future iterations could auto-derive from model configuration.

### Validation Behavior

- **Client (chat widget)**: Warns user before upload (soft enforcement)
- **Server (API layer)**: May enforce request size limits
- **Provider**: Provider-specific errors bubble up to consumer

The extension values represent the **most restrictive known limits** (what will definitely work).

### Multi-Agent Considerations

Agents may delegate to subagents with different constraints. For v1:
- Entry agent advertises **its own constraints**
- Subagent errors are mapped to meaningful messages that bubble up
- Documentation notes that constraints may vary with delegation

## Extension Schema

```typescript
// Extension URI: https://inkeep.com/a2a-extensions/input-constraints/v1

interface InputConstraintsExtensionParams {
  files?: {
    /** Maximum combined size of all files in bytes */
    maxTotalSizeBytes?: number;
    
    /** Maximum number of files per message */
    maxCountPerRequest?: number;
    
    /** Maximum size per individual file in bytes */
    maxSizePerFileBytes?: number;
    
    /** Per-MIME-type constraints (overrides global file limits) */
    perMimeType?: {
      [mimeType: string]: {
        maxSizeBytes?: number;
        maxDimensions?: {
          width: number;
          height: number;
        };
      };
    };
  };

  text?: {
    /** Maximum characters per text part */
    maxCharacters?: number;
    
    /** Maximum tokens (requires tokenizer to be meaningful) */
    maxTokens?: number;
    
    /** Tokenizer identifier (e.g., 'cl100k_base') */
    tokenizer?: string;
  };
}
```

## Example Agent Card

```json
{
  "name": "Vision Analysis Agent",
  "description": "Analyzes images and documents",
  "url": "https://api.example.com/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "extensions": [
      {
        "uri": "https://inkeep.com/a2a-extensions/input-constraints/v1",
        "description": "Input size and format constraints",
        "required": false,
        "params": {
          "files": {
            "maxTotalSizeBytes": 52428800,
            "maxCountPerRequest": 10,
            "maxSizePerFileBytes": 20971520,
            "perMimeType": {
              "image/png": {
                "maxSizeBytes": 10485760,
                "maxDimensions": { "width": 4096, "height": 4096 }
              },
              "image/jpeg": {
                "maxSizeBytes": 20971520,
                "maxDimensions": { "width": 8192, "height": 8192 }
              },
              "application/pdf": {
                "maxSizeBytes": 52428800
              }
            }
          },
          "text": {
            "maxCharacters": 100000,
            "maxTokens": 128000,
            "tokenizer": "cl100k_base"
          }
        }
      }
    ]
  },
  "defaultInputModes": ["text/plain", "image/png", "image/jpeg", "application/pdf"],
  "defaultOutputModes": ["text/plain", "application/json"],
  "skills": []
}
```

## User Stories

### STORY-1: Define Input Constraints Extension Schema

**Priority:** 1

As a platform developer, I want a well-defined TypeScript schema for input constraints so agents can declaratively advertise their limitations.

**Acceptance Criteria:**
- [ ] Schema covers file constraints (maxSizeBytes, maxCount, per-MIME-type limits, dimensions) - all optional
- [ ] Schema covers text constraints (maxCharacters, maxTokens) - all optional
- [ ] Schema is versioned via URI: `https://inkeep.com/a2a-extensions/input-constraints/v1`
- [ ] Schema is defined in `agents-core` as a Zod schema with TypeScript types exported
- [ ] Schema validates correctly with partial/missing fields

### STORY-2: Integrate Extension into Agent Card Generation

**Priority:** 2

As an agent developer, I want to configure my agent's input constraints so they appear in the Agent Card.

**Acceptance Criteria:**
- [ ] Agent Card generation includes inputConstraints extension when configured
- [ ] Extension appears in `capabilities.extensions` array following A2A spec format
- [ ] Constraints can be set via SDK builder API
- [ ] Constraints can be partially specified (only what's known)
- [ ] Existing agents without constraints continue to work (backward compatible)

### STORY-3: Chat Widget Enforces File Constraints

**Priority:** 3

As a chat widget user, I want the UI to prevent me from uploading files that exceed the agent's limits.

**Acceptance Criteria:**
- [ ] Widget fetches and parses inputConstraints extension from Agent Card
- [ ] File picker enforces `maxSizePerFileBytes` when specified
- [ ] File picker enforces `maxCountPerRequest` when specified
- [ ] File picker enforces `maxDimensions` for images when specified
- [ ] File picker filters to supported MIME types from `defaultInputModes`
- [ ] Clear error messages shown when constraints are violated
- [ ] Graceful fallback when extension is absent (no restrictions enforced)

### STORY-4: Chat Widget Shows Text Limits

**Priority:** 4

As a chat widget user, I want to see how much text I can input.

**Acceptance Criteria:**
- [ ] Text input shows character count when `maxCharacters` is specified
- [ ] Text input shows warning when approaching limit (e.g., 90%)
- [ ] Text input prevents exceeding limit or shows clear error
- [ ] Token count display when `maxTokens` specified (if tokenizer available)
- [ ] No indicator shown when limits not specified

### STORY-5: Document the Extension

**Priority:** 5

As a developer, I want documentation on how to use and consume the input constraints extension.

**Acceptance Criteria:**
- [ ] Extension schema documented in `agents-docs`
- [ ] Example Agent Card with extension shown
- [ ] SDK builder API usage documented
- [ ] Chat widget consumption documented
- [ ] Notes on constraint derivation (model limits, etc.) included

## Out of Scope (Future Considerations)

- Per-skill constraints (different skills have different limits)
- Auto-derivation of constraints from model configuration
- Rate limit display/enforcement in widget
- Structured data (`DataPart`) size constraints
- Dynamic constraints returned at runtime

## Open Questions

1. Should we support `maxTokens` without a tokenizer? (Would require client-side estimation)
2. Should dimension constraints support aspect ratio in addition to max width/height?
3. How should the widget handle mixed constraint sources (some from extension, some hardcoded)?

## References

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A Extensions Documentation](https://a2a-protocol.org/dev/topics/extensions)
- [Agent Card Schema](https://google.github.io/A2A/specification/#441-agentcard)
