import { getRegisteredTools } from './mcpServerInternals';

/**
 * Derive a human-readable display title from a tool. The first line of a
 * generated tool's description is the OpenAPI operation summary (e.g. "Health
 * check"); fall back to the tool name when no description is present.
 */
export function deriveToolTitle(name: string, description?: string): string {
  const firstLine = description?.split('\n', 1)[0]?.trim();
  return firstLine || name;
}

/**
 * The Speakeasy-generated tools ship with no top-level `title` and an empty
 * `annotations.title`, so MCP clients that label tools by title (e.g. the Claude
 * Desktop connectors UI) render blank rows. Fill both fields from the
 * description's first line so every client shows a readable name. Best-effort:
 * silently no-ops if the pinned SDK's internal tool-registry shape changes.
 */
export function fillMissingToolTitles(mcpServer: unknown): void {
  const tools = getRegisteredTools(mcpServer);
  if (!tools) {
    return;
  }
  for (const [name, tool] of Object.entries(tools)) {
    const title = deriveToolTitle(name, tool.description);
    if (!tool.title) {
      tool.title = title;
    }
    if (tool.annotations && !tool.annotations.title) {
      tool.annotations.title = title;
    }
  }
}
