export interface ActiveTool {
  name: string;
  description?: string;
}

/**
 * Finds orphaned tools - tools that are selected but no longer available in activeTools
 */
export function findOrphanedTools(
  selectedTools: string[] | null,
  activeTools: ActiveTool[] | undefined
): string[] {
  if (!selectedTools || !Array.isArray(selectedTools)) {
    return [];
  }
  return selectedTools.filter((toolName) => !activeTools?.some((tool) => tool.name === toolName));
}
