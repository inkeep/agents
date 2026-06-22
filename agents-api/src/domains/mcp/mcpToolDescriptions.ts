/**
 * Append happy-path examples / steering notes to a few high-traffic tool
 * descriptions at runtime.
 *
 * The generated descriptions are accurate but terse, and the `*-full-*` composites
 * have deeply nested input schemas (create-full-agent is ~1,200 lines), so an LLM
 * constructing one cold is error-prone. A short worked example in the description —
 * the one channel the model always reads when selecting/filling a tool — cuts
 * first-time errors. Best-effort runtime patch (mirrors fillMissingToolTitles);
 * the production home is an `x-speakeasy-mcp` description override in the spec.
 */

import { getRegisteredTools } from './mcpServerInternals';

const DESCRIPTION_ADDENDA: Record<string, string> = {
  'agents-create-full-agent': `

Minimal request body — an agent with one sub-agent that uses a data component:
{
  "id": "weather-bot",
  "name": "Weather Bot",
  "defaultSubAgentId": "main",
  "subAgents": {
    "main": { "id": "main", "name": "Main", "type": "internal", "canUse": [], "dataComponents": ["<data-component-id>"] }
  }
}
Notes: pass projectId as a separate top-level argument (tenantId is bound from your session — do NOT pass it). Attach data/artifact components as string-ID arrays on the SUB-AGENT (subAgents.<key>.dataComponents / .artifactComponents), NOT at the agent root; create the component first (data-components-create-data-component) and reference its id. canUse is a list of tool IDs and may be empty ([]).`,

  'agents-update-full-agent': `

This REPLACES the agent's full definition — include every sub-agent/tool/component you want to keep, or they are removed. For a simple field change (e.g. name or description), prefer agents-update-agent instead.`,

  'skills-update-skill': `

Destructive default: a 'files' array REPLACES the skill's full file set — any file you omit is dropped. To change one file, prefer skills-update-skill-file (or include every file you want to keep).`,
};

export function augmentToolDescriptions(mcpServer: unknown): void {
  const tools = getRegisteredTools(mcpServer);
  if (!tools) return;
  for (const [name, addendum] of Object.entries(DESCRIPTION_ADDENDA)) {
    const tool = tools[name];
    if (tool && typeof tool.description === 'string' && !tool.description.endsWith(addendum)) {
      tool.description += addendum;
    }
  }
}
