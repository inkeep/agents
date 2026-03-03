import type { AgentRunContext, ToolType } from '../agent-types';

export function getRelationshipIdForTool(
  ctx: AgentRunContext,
  toolName: string,
  toolType?: ToolType
): string | undefined {
  if (toolType === 'mcp') {
    const matchingTool = ctx.config.tools?.find((tool) => {
      if (tool.config?.type !== 'mcp') {
        return false;
      }

      if (tool.availableTools?.some((available) => available.name === toolName)) {
        return true;
      }

      if (tool.config.mcp.activeTools?.includes(toolName)) {
        return true;
      }

      return tool.name === toolName;
    });

    return matchingTool?.relationshipId;
  }

  if (toolType === 'tool') {
    return ctx.functionToolRelationshipIdByName.get(toolName);
  }

  if (toolType === 'delegation') {
    const relation = ctx.config.delegateRelations.find(
      (relation) =>
        `delegate_to_${relation.config.id.toLowerCase().replace(/\s+/g, '_')}` === toolName
    );

    return relation?.config.relationId;
  }
}
