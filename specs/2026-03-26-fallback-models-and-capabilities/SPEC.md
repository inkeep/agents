# Fallback Models & Capabilities Gating

## Problem

The framework routes LLM calls through Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set, which enables fallback models and per-request cost tracking. Both features are invisible to users — fallback requires manually crafting `providerOptions` JSON, and cost UI shows unconditionally even when no cost data exists.

## Goals

1. Add first-class `fallbackModels` support to model configuration (schema, runtime, UI)
2. Extend the `/capabilities` endpoint with feature-oriented flags (`modelFallback`, `costTracking`)
3. Gate UI features on capabilities — fallback model UI and cost navigation

## Non-Goals

- Framework-level retry/failover (non-gateway providers)
- Per-fallback provider options
- Cost estimation without gateway

---

## Change Set

### 1. Schema — `ModelSettingsSchema`

**File:** `packages/agents-core/src/validation/schemas.ts`

Add `fallbackModels` to `ModelSettingsSchema`:

```typescript
export const ModelSettingsSchema = z
  .object({
    model: z.string().optional().describe('The model to use.'),
    providerOptions: z
      .record(z.string(), z.any())
      .optional()
      .describe('The provider options.'),
    fallbackModels: z
      .array(z.string())
      .optional()
      .describe(
        'Ordered list of fallback models if the primary fails. Requires AI Gateway. Format: provider/model (e.g. "openai/gpt-5.2").'
      ),
  })
  .openapi('ModelSettings');
```

**Impact:** This schema is used by `ModelSchema` and `ProjectModelSchema` (same file), which compose `ModelSettingsSchema` for `base`, `structuredOutput`, and `summarizer` slots. All three slots automatically get `fallbackModels` support — no additional schema changes.

**Inheritance:** Falls through the existing project → agent → sub-agent inheritance chain since `ModelSettings` is the unit of inheritance. The UI already passes the full `ModelSettings` object through the chain.

---

### 2. Runtime — `ModelFactory.prepareGenerationConfig`

**File:** `packages/agents-core/src/utils/model-factory.ts`

In `prepareGenerationConfig()`, after extracting `streamProviderOptions`, inject `fallbackModels` into gateway provider options when gateway is available:

```typescript
static prepareGenerationConfig(modelSettings?: ModelSettings): {
  model: LanguageModel;
  maxDuration?: number;
  providerOptions?: Record<string, JSONObject>;
} {
  // ... existing model creation and extraction ...

  // Translate fallbackModels → gateway provider options
  if (modelSettings?.fallbackModels?.length && process.env.AI_GATEWAY_API_KEY) {
    const existingGateway = (streamProviderOptions?.gateway ?? {}) as Record<string, unknown>;
    streamProviderOptions = {
      ...streamProviderOptions,
      gateway: {
        ...existingGateway,
        models: modelSettings.fallbackModels,
      } as JSONObject,
    };
  }

  return {
    model,
    ...generationParams,
    ...(maxDuration !== undefined && { maxDuration }),
    ...(streamProviderOptions !== undefined && {
      providerOptions: streamProviderOptions as Record<string, JSONObject>,
    }),
  };
}
```

**Behavior:** If `AI_GATEWAY_API_KEY` is not set, `fallbackModels` is silently ignored. If a user manually also sets `providerOptions.gateway.models`, the explicit `fallbackModels` field takes precedence (overwrites).

---

### 3. Capabilities endpoint — response schema

**File:** `agents-api/src/routes/capabilities.ts`

Extend `CapabilitiesResponseSchema` with two new fields:

```typescript
const CapabilitiesResponseSchema = z
  .object({
    sandbox: z.object({
      configured: z.boolean().describe('Whether a sandbox provider is configured.'),
      provider: z.enum(['native', 'vercel']).optional(),
      runtime: z.enum(['node22', 'typescript']).optional(),
    }),
    modelFallback: z.object({
      enabled: z.boolean().describe('Whether fallback model support is available.'),
    }),
    costTracking: z.object({
      enabled: z.boolean().describe('Whether per-request cost tracking is available.'),
    }),
  })
  .openapi('CapabilitiesResponseSchema');
```

Update the handler:

```typescript
capabilitiesHandler.openapi(route, (c) => {
  const sandboxConfig = c.get('sandboxConfig');
  const aiGatewayConfigured = !!process.env.AI_GATEWAY_API_KEY;

  return c.json({
    sandbox: sandboxConfig
      ? { configured: true, provider: sandboxConfig.provider, runtime: sandboxConfig.runtime }
      : { configured: false },
    modelFallback: { enabled: aiGatewayConfigured },
    costTracking: { enabled: aiGatewayConfigured },
  });
});
```

No changes needed to types, middleware, or app setup — `AI_GATEWAY_API_KEY` is read directly from `process.env` (no context injection needed).

---

### 4. UI — Capabilities type

**File:** `agents-manage-ui/src/lib/actions/capabilities.ts`

Update the `Capabilities` type:

```typescript
export type Capabilities = {
  sandbox: {
    configured: boolean;
    provider?: 'native' | 'vercel';
    runtime?: 'node22' | 'typescript';
  };
  modelFallback: {
    enabled: boolean;
  };
  costTracking: {
    enabled: boolean;
  };
};
```

No changes to `getCapabilitiesAction()` or `useCapabilitiesQuery()` — they already handle the full response object.

---

### 5. UI — Fallback model selection

**File:** `agents-manage-ui/src/components/shared/model-configuration.tsx`

Add fallback model UI below the existing `ModelSelector` and provider options editor, gated on capabilities:

- Fetch capabilities via `useCapabilitiesQuery()`
- When `capabilities.modelFallback.enabled` and a primary model is selected:
  - Render existing `fallbackModels` as a list of `ModelSelector` instances (reuse same component)
  - Each row has a remove button
  - "Add fallback model" button appends to the array
  - Array order = fallback priority

**New props on `ModelConfiguration`:**

```typescript
interface ModelConfigurationProps {
  // ... existing props ...
  fallbackModels?: string[];
  inheritedFallbackModels?: string[];
  onFallbackModelsChange?: (models: string[]) => void;
}
```

**Visual layout:**

```
Base Model:       [anthropic/claude-sonnet-4.5  ▾] [×]
  Provider Options: [{ ... }]
  Fallback Models:
    1. [openai/gpt-5.2              ▾] [×]
    2. [google/gemini-2.5-pro        ▾] [×]
    [+ Add fallback model]
```

The "Fallback Models" section only renders when `capabilities.modelFallback.enabled` is true.

---

### 6. UI — Wire up fallback models in ModelSection

**File:** `agents-manage-ui/src/components/agent/sidepane/nodes/model-section.tsx`

For each model slot (base, structuredOutput, summarizer), pass `fallbackModels` and `onFallbackModelsChange` to `ModelConfiguration`:

```typescript
<ModelConfiguration
  value={models?.base?.model}
  providerOptions={models?.base?.providerOptions}
  fallbackModels={models?.base?.fallbackModels}
  inheritedFallbackModels={agentModels?.base?.fallbackModels || projectModels?.base?.fallbackModels}
  onFallbackModelsChange={(models) => updatePath('models.base.fallbackModels', models)}
  // ... existing props ...
/>
```

Same pattern for `structuredOutput` and `summarizer` slots.

---

### 7. UI — Wire up fallback models in ProjectModelsSection

**File:** `agents-manage-ui/src/components/projects/form/project-models-section.tsx`

Same approach — pass `fallbackModels` and handler through to the `ModelConfiguration` for each slot in the project form.

---

### 8. UI — Serialization

**File:** `agents-manage-ui/src/features/agent/domain/serialize.ts`

Update `processModels()` to include `fallbackModels`:

```typescript
// In processModels(), for each slot (base, structuredOutput, summarizer):
// Include fallbackModels if present
...(slot.fallbackModels?.length ? { fallbackModels: slot.fallbackModels } : {}),
```

**File:** `agents-manage-ui/src/features/agent/domain/deserialize.ts`

Update model deserialization to map `fallbackModels` through:

```typescript
base: subAgent.models.base ? {
  model: subAgent.models.base.model ?? '',
  providerOptions: ...,
  fallbackModels: subAgent.models.base.fallbackModels,
} : undefined,
```

---

### 9. UI — Hide cost navigation

**File:** `agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx`

Gate the "Cost" nav items on capabilities. Two locations (org-level and project-level nav):

```typescript
const { data: capabilities } = useCapabilitiesQuery();

// Replace the unconditional Cost nav item with:
...(capabilities?.costTracking?.enabled ? [{
  title: 'Cost',
  url: `/${tenantId}/cost`,
  icon: Coins,
}] : []),
```

Same pattern for the project-level Cost nav item.

Note: Cost in trace panels (`render-panel-content.tsx`, `timeline-item.tsx`) already self-hides via `costUsd != null` checks — no changes needed there.

---

### 10. Tests

**File:** `packages/agents-core/src/__tests__/utils/model-factory.test.ts`

Add tests for `prepareGenerationConfig` fallback translation:

- `fallbackModels` + `AI_GATEWAY_API_KEY` set → `providerOptions.gateway.models` populated
- `fallbackModels` + no `AI_GATEWAY_API_KEY` → `providerOptions` unchanged (fallbacks ignored)
- `fallbackModels` + existing `providerOptions.gateway` → merged correctly
- Empty `fallbackModels` array → no gateway injection

**File:** `agents-api/src/__tests__/capabilities.test.ts`

Add tests for new capability fields:

- With `AI_GATEWAY_API_KEY` set → `modelFallback.enabled: true`, `costTracking.enabled: true`
- Without `AI_GATEWAY_API_KEY` → `modelFallback.enabled: false`, `costTracking.enabled: false`

---

## Files Touched (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `packages/agents-core/src/validation/schemas.ts` | Add `fallbackModels` to `ModelSettingsSchema` |
| 2 | `packages/agents-core/src/utils/model-factory.ts` | Translate `fallbackModels` → gateway providerOptions in `prepareGenerationConfig` |
| 3 | `agents-api/src/routes/capabilities.ts` | Add `modelFallback` and `costTracking` to response |
| 4 | `agents-manage-ui/src/lib/actions/capabilities.ts` | Update `Capabilities` type |
| 5 | `agents-manage-ui/src/components/shared/model-configuration.tsx` | Add fallback model list UI (gated on capabilities) |
| 6 | `agents-manage-ui/src/components/agent/sidepane/nodes/model-section.tsx` | Pass `fallbackModels` props |
| 7 | `agents-manage-ui/src/components/projects/form/project-models-section.tsx` | Pass `fallbackModels` props |
| 8 | `agents-manage-ui/src/features/agent/domain/serialize.ts` | Include `fallbackModels` in serialization |
| 9 | `agents-manage-ui/src/features/agent/domain/deserialize.ts` | Include `fallbackModels` in deserialization |
| 10 | `agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx` | Gate Cost nav on `costTracking.enabled` |
| 11 | `packages/agents-core/src/__tests__/utils/model-factory.test.ts` | Tests for fallback translation |
| 12 | `agents-api/src/__tests__/capabilities.test.ts` | Tests for new capability fields |

---

## Decision Log

| # | Decision | Status |
|---|----------|--------|
| 1 | `fallbackModels` is a simple `string[]` (not `ModelSettings[]`) | LOCKED |
| 2 | Translation happens in `prepareGenerationConfig`, not `extractStreamProviderOptions` | LOCKED |
| 3 | Fallbacks silently ignored when `AI_GATEWAY_API_KEY` absent | LOCKED |
| 4 | Capabilities use feature-oriented naming (`modelFallback`, `costTracking`) not infra naming | LOCKED |
| 5 | `AI_GATEWAY_API_KEY` read from `process.env` directly in handler (no context injection) | LOCKED |
| 6 | Fallback models inherit through existing project → agent → sub-agent chain | LOCKED |
| 7 | Fallback UI reuses existing `ModelSelector` component | LOCKED |
| 8 | Cost in traces already self-hides; only sidebar nav needs gating | LOCKED |

---

## Agent Constraints

**SCOPE:** Files listed in the summary table above. All changes extend existing patterns.

**EXCLUDE:** Database schema (no migration needed — `providerOptions` and model config are stored as JSON). Auth/permissions (capabilities endpoint already uses `manageBearerOrSessionAuth`). SDK codegen (separate follow-up if needed).

**STOP_IF:** Any change requires a database migration. Any change touches auth boundaries. The `@ai-sdk/gateway` provider options format differs from what's documented here.

**ASK_FIRST:** Before modifying any file not in the summary table. Before adding new dependencies.
