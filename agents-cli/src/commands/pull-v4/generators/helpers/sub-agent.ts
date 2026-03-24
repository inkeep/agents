import {
  type CodeValue,
  codeMethodCall,
  codeReference,
  resolveReferenceName,
  toCamelCase,
} from '../../utils';

interface DelegateReferenceOverrides {
  subAgents?: Record<string, string>;
  agents?: Record<string, string>;
  externalAgents?: Record<string, string>;
}

export interface NormalizedCanUseEntry {
  toolId: string;
  selectedTools?: unknown[];
  headers?: Record<string, unknown>;
  toolPolicies?: Record<string, unknown>;
}

export type NormalizedDelegateTargetType = 'subAgents' | 'agents' | 'externalAgents';

export interface NormalizedCanDelegateToEntry {
  id: string;
  type?: NormalizedDelegateTargetType;
  headers?: Record<string, unknown>;
}

export type NormalizedSkillEntry =
  | string
  | {
      id: string;
      index?: number;
      alwaysLoaded?: boolean;
    };

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
  canUse?: NormalizedCanUseEntry[],
  toolReferenceOverrides?: Record<string, string>
): CodeValue[] {
  if (!canUse?.length) {
    return [];
  }

  const references: CodeValue[] = [];
  for (const item of canUse) {
    const toolReference = resolveReferenceName(item.toolId, [toolReferenceOverrides]);
    const withConfig: Record<string, unknown> = {};

    if (item.selectedTools?.length) {
      withConfig.selectedTools = item.selectedTools;
    }

    if (item.headers && Object.keys(item.headers).length > 0) {
      withConfig.headers = item.headers;
    }

    if (item.toolPolicies && Object.keys(item.toolPolicies).length > 0) {
      withConfig.toolPolicies = item.toolPolicies;
    }

    if (Object.keys(withConfig).length > 0) {
      references.push(codeMethodCall(codeReference(toolReference), 'with', withConfig));
      continue;
    }

    references.push(codeReference(toolReference));
  }

  return references;
}

export function collectCanDelegateToReferences(
  canDelegateTo: NormalizedCanDelegateToEntry[] | undefined,
  referenceOverrides: DelegateReferenceOverrides
): CodeValue[] {
  if (!canDelegateTo?.length) {
    return [];
  }

  const references: CodeValue[] = [];
  for (const item of canDelegateTo) {
    const targetReference =
      item.type === 'agents'
        ? resolveReferenceName(item.id, [referenceOverrides.agents])
        : item.type === 'externalAgents'
          ? resolveReferenceName(item.id, [referenceOverrides.externalAgents])
          : resolveReferenceName(item.id, [
              referenceOverrides.subAgents,
              referenceOverrides.agents,
              referenceOverrides.externalAgents,
            ]);

    if (item.headers && Object.keys(item.headers).length > 0) {
      references.push(
        codeMethodCall(codeReference(targetReference), 'with', { headers: item.headers })
      );
      continue;
    }

    references.push(codeReference(targetReference));
  }

  return references;
}

export function collectSkills(skills?: NormalizedSkillEntry[]): unknown[] {
  if (!skills?.length) {
    return [];
  }

  const formattedSkills: unknown[] = [];
  for (const skill of skills) {
    if (typeof skill === 'string') {
      formattedSkills.push(skill);
      continue;
    }

    const formattedSkill: Record<string, unknown> = { id: skill.id };
    if (typeof skill.index === 'number') {
      formattedSkill.index = skill.index;
    }
    if (typeof skill.alwaysLoaded === 'boolean') {
      formattedSkill.alwaysLoaded = skill.alwaysLoaded;
    }

    formattedSkills.push(formattedSkill);
  }

  return formattedSkills;
}
