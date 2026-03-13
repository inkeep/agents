import { formatInlineLiteral, isPlainObject, resolveReferenceName, toCamelCase } from '../utils';

interface DelegateReferenceOverrides {
  subAgents?: Record<string, string>;
  agents?: Record<string, string>;
  externalAgents?: Record<string, string>;
}

export function resolveSubAgentName(subAgentId: string, name?: string): string {
  if (name !== undefined) {
    return name;
  }

  return subAgentId
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveSubAgentVariableName(subAgentId: string, name?: string): string {
  const seed = name || subAgentId;
  return toCamelCase(seed);
}

export function collectCanUseReferences(
  canUse?: unknown[],
  toolReferenceOverrides?: Record<string, string>
): string[] {
  if (!Array.isArray(canUse)) {
    return [];
  }

  const references: string[] = [];
  for (const item of canUse) {
    if (typeof item === 'string') {
      references.push(resolveReferenceName(item, [toolReferenceOverrides]));
      continue;
    }

    if (!isPlainObject(item)) {
      continue;
    }

    const toolId = typeof item.toolId === 'string' ? item.toolId : undefined;
    if (!toolId) {
      continue;
    }

    const toolReference = resolveReferenceName(toolId, [toolReferenceOverrides]);
    const withConfig: Record<string, unknown> = {};
    const selectedTools =
      Array.isArray(item.toolSelection) && item.toolSelection.length
        ? item.toolSelection
        : Array.isArray(item.selectedTools) && item.selectedTools.length
          ? item.selectedTools
          : undefined;

    if (selectedTools) {
      withConfig.selectedTools = selectedTools;
    }

    if (isPlainObject(item.headers) && Object.keys(item.headers).length) {
      withConfig.headers = item.headers;
    }

    if (isPlainObject(item.toolPolicies) && Object.keys(item.toolPolicies).length) {
      withConfig.toolPolicies = item.toolPolicies;
    }

    if (Object.keys(withConfig).length > 0) {
      references.push(`${toolReference}.with(${formatInlineLiteral(withConfig)})`);
      continue;
    }

    references.push(toolReference);
  }

  return references;
}

export function collectCanDelegateToReferences(
  canDelegateTo: unknown[] | undefined,
  referenceOverrides: DelegateReferenceOverrides
): string[] {
  if (!Array.isArray(canDelegateTo)) {
    return [];
  }

  const references: string[] = [];
  for (const item of canDelegateTo) {
    if (typeof item === 'string') {
      references.push(
        resolveReferenceName(item, [
          referenceOverrides.subAgents,
          referenceOverrides.agents,
          referenceOverrides.externalAgents,
        ])
      );
      continue;
    }

    if (!isPlainObject(item)) {
      continue;
    }

    const subAgentId = typeof item.subAgentId === 'string' ? item.subAgentId : undefined;
    const agentId = typeof item.agentId === 'string' ? item.agentId : undefined;
    const externalAgentId =
      typeof item.externalAgentId === 'string' ? item.externalAgentId : undefined;
    const targetId = subAgentId || agentId || externalAgentId;

    if (!targetId) {
      continue;
    }

    const targetReference = subAgentId
      ? resolveReferenceName(subAgentId, [referenceOverrides.subAgents])
      : agentId
        ? resolveReferenceName(agentId, [referenceOverrides.agents])
        : resolveReferenceName(targetId, [referenceOverrides.externalAgents]);

    if (isPlainObject(item.headers) && Object.keys(item.headers).length > 0) {
      references.push(
        `${targetReference}.with(${formatInlineLiteral({
          headers: item.headers,
        })})`
      );
      continue;
    }

    references.push(targetReference);
  }

  return references;
}

export function collectSkills(skills?: unknown[]): string[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  const formattedSkills: string[] = [];
  for (const skill of skills) {
    if (typeof skill === 'string') {
      formattedSkills.push(formatInlineLiteral(skill));
      continue;
    }

    if (!isPlainObject(skill)) {
      continue;
    }

    const skillId =
      typeof skill.id === 'string'
        ? skill.id
        : typeof skill.skillId === 'string'
          ? skill.skillId
          : undefined;
    if (!skillId) {
      continue;
    }

    const formattedSkill: Record<string, unknown> = { id: skillId };
    if (typeof skill.index === 'number' && Number.isInteger(skill.index)) {
      formattedSkill.index = skill.index;
    }
    if (typeof skill.alwaysLoaded === 'boolean') {
      formattedSkill.alwaysLoaded = skill.alwaysLoaded;
    }

    formattedSkills.push(formatInlineLiteral(formattedSkill));
  }

  return formattedSkills;
}
