import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import type { ComponentRegistry, ComponentType } from './component-registry';
import type { GenerationResolver } from './generation-resolver';

export interface ProjectPaths {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
  credentialsDir: string;
  contextConfigsDir: string;
  externalAgentsDir: string;
}

export interface GenerationContext {
  project: FullProjectDefinition;
  paths: ProjectPaths;
  completeAgentIds: Set<string>;
  existingComponentRegistry?: ComponentRegistry;
  resolver: GenerationResolver;
}

export interface GenerationRecord<TPayload> {
  id: string;
  filePath: string;
  payload: TPayload;
}

export interface GenerationTask<TPayload> {
  type: string;
  collect: (context: GenerationContext) => GenerationRecord<TPayload>[];
  generate: (payload: TPayload) => SourceFile;
}

export type SubAgentReferenceOverrideType =
  | 'tools'
  | 'subAgents'
  | 'agents'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents';

export type SubAgentReferenceOverrides = Partial<
  Record<SubAgentReferenceOverrideType, Record<string, string>>
>;

export type SubAgentReferencePathOverrides = Partial<
  Record<'tools' | 'subAgents' | 'agents' | 'externalAgents', Record<string, string>>
>;

export interface SubAgentDependencyReferences {
  referenceOverrides?: SubAgentReferenceOverrides;
  referencePathOverrides?: SubAgentReferencePathOverrides;
}

export type ProjectReferenceOverrideType =
  | 'agents'
  | 'tools'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents'
  | 'credentialReferences';

export type ProjectReferenceOverrides = Partial<
  Record<ProjectReferenceOverrideType, Record<string, string>>
>;

export type ProjectReferencePathOverrides = Partial<
  Record<ProjectReferenceOverrideType, Record<string, string>>
>;

export interface TemplateReferenceOverride {
  name: string;
  local?: boolean;
}

export interface ContextTemplateReferences {
  contextConfigId: string;
  contextConfigReference: TemplateReferenceOverride;
  contextConfigHeadersReference?: TemplateReferenceOverride;
}

export interface SkippedAgent {
  id: string;
  reason: string;
}

export function collectCompleteAgentIds(
  project: FullProjectDefinition,
  skippedAgents: SkippedAgent[]
): Set<string> {
  const completeAgentIds = new Set<string>();
  for (const [agentId, agentData] of Object.entries(project.agents ?? {})) {
    const completeness = isAgentComplete(agentData);
    if (!completeness.complete) {
      skippedAgents.push({ id: agentId, reason: completeness.reason ?? 'incomplete' });
      continue;
    }
    completeAgentIds.add(agentId);
  }
  return completeAgentIds;
}

function isAgentComplete(
  agentData: unknown
): { complete: true } | { complete: false; reason: string } {
  const data = asRecord(agentData);
  if (!data) {
    return { complete: false, reason: 'invalid agent object' };
  }
  if (!data.name || typeof data.name !== 'string') {
    return { complete: false, reason: 'missing name' };
  }
  if (!data.defaultSubAgentId || typeof data.defaultSubAgentId !== 'string') {
    return { complete: false, reason: 'missing defaultSubAgentId' };
  }
  if (
    !asRecord(data.subAgents) ||
    // @ts-expect-error -- existing runtime behavior
    !Object.keys(data.subAgents).length
  ) {
    return { complete: false, reason: 'no sub-agents defined' };
  }
  return { complete: true };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

export function validateProject(project: FullProjectDefinition): void {
  if (!project || typeof project !== 'object') {
    throw new Error('Project data is required');
  }
  if (!project.id) {
    throw new Error('Project id is required');
  }
  if (!project.name) {
    throw new Error('Project name is required');
  }
}

export function assignComponentReferenceOverrideForProject(
  registry: ComponentRegistry,
  overrides: ProjectReferenceOverrides,
  overrideType: ProjectReferenceOverrideType,
  componentId: string,
  componentType: ComponentType
): boolean {
  const component = registry.get(componentId, componentType);
  if (!component?.name) {
    return false;
  }

  const overrideMap = overrides[overrideType] ?? {};
  overrideMap[componentId] = component.name;
  overrides[overrideType] = overrideMap;
  return true;
}
