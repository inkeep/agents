import { basename, dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ComponentInfo, ComponentRegistry, ComponentType } from './component-registry';
import { resolveSubAgentVariableName } from './generators/helpers/sub-agent';
import {
  buildComponentFileName,
  isHumanReadableId,
  toCamelCase,
  toCredentialReferenceName,
  toKebabCase,
  toToolReferenceName,
} from './utils';

interface GenerationResolverOptions {
  project: FullProjectDefinition;
  projectRoot: string;
  completeAgentIds: Iterable<string>;
  existingComponentRegistry?: ComponentRegistry;
}

export interface FunctionToolEntry {
  functionToolId: string;
  functionId: string;
  functionToolData: Record<string, unknown>;
  functionData: Record<string, unknown>;
  exportName: string;
  fileName: string;
}

export class GenerationResolver {
  private readonly projectRoot: string;
  private readonly existingComponentRegistry?: ComponentRegistry;
  private readonly toolReferenceNamesById: Record<string, string>;
  private readonly toolReferencePathsById: Record<string, string>;
  private readonly credentialReferenceNamesById: Record<string, string>;
  private readonly credentialReferencePathsById: Record<string, string>;
  private readonly externalAgentReferenceNamesById: Record<string, string>;
  private readonly externalAgentReferencePathsById: Record<string, string>;
  private readonly subAgentReferenceNamesById: Record<string, string>;
  private readonly subAgentReferencePathsById: Record<string, string>;
  private readonly agentReferenceNamesById: Record<string, string>;
  private readonly agentReferencePathsById: Record<string, string>;

  constructor({
    project,
    projectRoot,
    completeAgentIds,
    existingComponentRegistry,
  }: GenerationResolverOptions) {
    this.projectRoot = projectRoot;
    this.existingComponentRegistry = existingComponentRegistry;
    this.toolReferenceNamesById = buildToolReferenceNamesById(project);
    this.toolReferencePathsById = buildToolReferencePathById(project);
    this.credentialReferenceNamesById = buildCredentialReferenceNamesById(project);
    this.credentialReferencePathsById = buildCredentialReferencePathById(project);
    this.externalAgentReferenceNamesById = buildExternalAgentReferenceNamesById(project);
    this.externalAgentReferencePathsById = buildExternalAgentReferencePathById(project);
    this.subAgentReferenceNamesById = buildSubAgentReferenceNamesById(project, completeAgentIds);
    this.subAgentReferencePathsById = buildSubAgentReferencePathById(project, completeAgentIds);
    this.agentReferenceNamesById = buildAgentReferenceNamesById(project);
    this.agentReferencePathsById = buildAgentReferencePathById(project);
  }

  getExistingComponent(id: string, type: ComponentType): ComponentInfo | undefined {
    return this.existingComponentRegistry?.get(id, type);
  }

  resolveOutputFilePath(
    componentType: ComponentType,
    componentId: string,
    fallbackFilePath: string
  ): string {
    const existingComponent = this.getExistingComponent(componentId, componentType);
    if (!existingComponent?.filePath) {
      return fallbackFilePath;
    }

    return resolveProjectFilePath(this.projectRoot, existingComponent.filePath);
  }

  getToolReferenceName(toolId: string): string | undefined {
    return this.getPreferredReferenceName(
      toolId,
      ['functionTools', 'tools'],
      this.toolReferenceNamesById
    );
  }

  getToolReferencePath(toolId: string): string | undefined {
    const existingTool =
      this.getExistingComponent(toolId, 'functionTools') ??
      this.getExistingComponent(toolId, 'tools');
    if (existingTool?.filePath) {
      return resolveToolModulePath(existingTool.filePath);
    }

    return this.toolReferencePathsById[toolId];
  }

  getCredentialReferenceName(credentialId: string): string | undefined {
    return this.getPreferredReferenceName(
      credentialId,
      ['credentials'],
      this.credentialReferenceNamesById
    );
  }

  getCredentialReferencePath(credentialId: string): string | undefined {
    return this.getPreferredReferencePath(
      credentialId,
      ['credentials'],
      this.credentialReferencePathsById
    );
  }

  getExternalAgentReferenceName(externalAgentId: string): string | undefined {
    return this.getPreferredReferenceName(
      externalAgentId,
      ['externalAgents'],
      this.externalAgentReferenceNamesById
    );
  }

  getExternalAgentReferencePath(externalAgentId: string): string | undefined {
    return this.getPreferredReferencePath(
      externalAgentId,
      ['externalAgents'],
      this.externalAgentReferencePathsById
    );
  }

  getSubAgentReferenceName(subAgentId: string): string | undefined {
    return this.getPreferredReferenceName(
      subAgentId,
      ['subAgents'],
      this.subAgentReferenceNamesById
    );
  }

  getSubAgentReferencePath(subAgentId: string): string | undefined {
    return this.getPreferredReferencePath(
      subAgentId,
      ['subAgents'],
      this.subAgentReferencePathsById
    );
  }

  getAgentReferenceName(agentId: string): string | undefined {
    return this.getPreferredReferenceName(agentId, ['agents'], this.agentReferenceNamesById);
  }

  getAgentReferencePath(agentId: string): string | undefined {
    return this.getPreferredReferencePath(agentId, ['agents'], this.agentReferencePathsById);
  }

  private getPreferredReferenceName(
    componentId: string,
    componentTypes: ComponentType[],
    generatedNamesById: Record<string, string>
  ): string | undefined {
    const existingComponent = this.getExistingComponentByTypes(componentId, componentTypes);
    if (existingComponent?.name) {
      return existingComponent.name;
    }

    return generatedNamesById[componentId];
  }

  private getPreferredReferencePath(
    componentId: string,
    componentTypes: ComponentType[],
    generatedPathsById: Record<string, string>
  ): string | undefined {
    const existingComponent = this.getExistingComponentByTypes(componentId, componentTypes);
    if (existingComponent?.filePath) {
      return stripExtension(basename(existingComponent.filePath));
    }

    return generatedPathsById[componentId];
  }

  private getExistingComponentByTypes(
    componentId: string,
    componentTypes: ComponentType[]
  ): ComponentInfo | undefined {
    for (const componentType of componentTypes) {
      const component = this.getExistingComponent(componentId, componentType);
      if (component) {
        return component;
      }
    }

    return;
  }
}

export function collectFunctionToolEntries(project: FullProjectDefinition): FunctionToolEntry[] {
  const functionToolsById = collectFunctionToolsById(project);
  const functionsById = collectFunctionsById(project);
  const entries: FunctionToolEntry[] = [];

  for (const [functionToolId, functionToolData] of Object.entries(functionToolsById)) {
    const functionId =
      typeof functionToolData.functionId === 'string' && functionToolData.functionId.length > 0
        ? functionToolData.functionId
        : functionToolId;
    const functionData = functionsById[functionId] ?? {};
    const functionToolName =
      typeof functionToolData.name === 'string' && functionToolData.name.length > 0
        ? functionToolData.name
        : undefined;
    const functionName =
      typeof functionData.name === 'string' && functionData.name.length > 0
        ? functionData.name
        : undefined;
    const fallbackName = functionToolName ?? functionName ?? functionToolId;

    entries.push({
      functionToolId,
      functionId,
      functionToolData,
      functionData,
      exportName: fallbackName,
      fileName: fallbackName,
    });
  }

  return entries;
}

function collectFunctionToolsById(
  project: FullProjectDefinition
): Record<string, Record<string, unknown>> {
  const functionToolsById: Record<string, Record<string, unknown>> = {};

  for (const [functionToolId, functionToolData] of Object.entries(project.functionTools ?? {})) {
    const functionToolRecord = asRecord(functionToolData);
    if (!functionToolRecord) {
      continue;
    }

    functionToolsById[functionToolId] = {
      ...functionToolRecord,
    };
  }

  for (const agentData of Object.values(project.agents ?? {})) {
    const agentRecord = asRecord(agentData);
    const agentFunctionTools = asRecord(agentRecord?.functionTools);
    if (!agentFunctionTools) {
      continue;
    }

    for (const [functionToolId, functionToolData] of Object.entries(agentFunctionTools)) {
      const functionToolRecord = asRecord(functionToolData);
      if (!functionToolRecord) {
        continue;
      }

      const existingFunctionTool = functionToolsById[functionToolId] ?? {};
      functionToolsById[functionToolId] = {
        ...functionToolRecord,
        ...existingFunctionTool,
      };
    }
  }

  return functionToolsById;
}

function collectFunctionsById(
  project: FullProjectDefinition
): Record<string, Record<string, unknown>> {
  const functionsById: Record<string, Record<string, unknown>> = {};

  for (const [functionId, functionData] of Object.entries(project.functions ?? {})) {
    const functionRecord = asRecord(functionData);
    if (!functionRecord) {
      continue;
    }

    functionsById[functionId] = {
      ...functionRecord,
    };
  }

  for (const agentData of Object.values(project.agents ?? {})) {
    const agentRecord = asRecord(agentData);
    const agentFunctions = asRecord(agentRecord?.functions);
    if (!agentFunctions) {
      continue;
    }

    for (const [functionId, functionData] of Object.entries(agentFunctions)) {
      const functionRecord = asRecord(functionData);
      if (!functionRecord) {
        continue;
      }

      const existingFunction = functionsById[functionId] ?? {};
      functionsById[functionId] = {
        ...functionRecord,
        ...existingFunction,
      };
    }
  }

  return functionsById;
}

function buildToolReferenceNamesById(project: FullProjectDefinition): Record<string, string> {
  const toolReferenceNamesById: Record<string, string> = {};

  for (const [toolId, toolData] of Object.entries(project.tools ?? {})) {
    const toolName = asRecord(toolData)?.name;
    const referenceName =
      typeof toolName === 'string' && toolName.length > 0
        ? toToolReferenceName(toolName)
        : toToolReferenceName(toolId);
    toolReferenceNamesById[toolId] = referenceName;
  }

  for (const functionToolEntry of collectFunctionToolEntries(project)) {
    toolReferenceNamesById[functionToolEntry.functionToolId] = toToolReferenceName(
      functionToolEntry.exportName
    );
  }

  return toolReferenceNamesById;
}

function buildToolReferencePathById(project: FullProjectDefinition): Record<string, string> {
  const toolEntries = Object.entries(project.tools ?? {});
  const toolFileNamesById = buildSequentialNameFileNames(toolEntries);
  const toolReferencePathById: Record<string, string> = {};

  for (const [toolId] of toolEntries) {
    toolReferencePathById[toolId] = stripExtension(toolFileNamesById[toolId]);
  }

  const functionToolEntries = collectFunctionToolEntries(project);
  const functionToolFileNamesById = buildSequentialNameFileNames(
    functionToolEntries.map(({ functionToolId, fileName }) => [functionToolId, { name: fileName }])
  );
  for (const { functionToolId } of functionToolEntries) {
    toolReferencePathById[functionToolId] = stripExtension(
      functionToolFileNamesById[functionToolId]
    );
  }

  return toolReferencePathById;
}

function buildCredentialReferenceNamesById(project: FullProjectDefinition): Record<string, string> {
  const credentialReferenceNamesById: Record<string, string> = {};
  const countsByReferenceName = new Map<string, number>();

  for (const [credentialId, credentialData] of Object.entries(project.credentialReferences ?? {})) {
    const credentialName = asRecord(credentialData)?.name;
    const baseReferenceName =
      typeof credentialName === 'string' && credentialName.length > 0
        ? toCredentialReferenceName(credentialName)
        : toCredentialReferenceName(credentialId);
    const occurrence = countsByReferenceName.get(baseReferenceName) ?? 0;
    countsByReferenceName.set(baseReferenceName, occurrence + 1);
    credentialReferenceNamesById[credentialId] =
      occurrence === 0 ? baseReferenceName : `${baseReferenceName}${occurrence}`;
  }

  return credentialReferenceNamesById;
}

function buildCredentialReferencePathById(project: FullProjectDefinition): Record<string, string> {
  const credentialEntries = Object.entries(project.credentialReferences ?? {});
  const credentialFileNamesById = buildSequentialNameFileNames(credentialEntries);
  const credentialReferencePathById: Record<string, string> = {};

  for (const [credentialId] of credentialEntries) {
    credentialReferencePathById[credentialId] = stripExtension(
      credentialFileNamesById[credentialId]
    );
  }

  return credentialReferencePathById;
}

function buildExternalAgentReferenceNamesById(
  project: FullProjectDefinition
): Record<string, string> {
  const externalAgentReferenceNamesById: Record<string, string> = {};
  const countsByReferenceName = new Map<string, number>();

  for (const [externalAgentId, externalAgentData] of Object.entries(project.externalAgents ?? {})) {
    const baseReferenceName = toExternalAgentReferenceName(
      resolveExternalAgentNamingSeed(externalAgentId, externalAgentData)
    );
    const occurrence = countsByReferenceName.get(baseReferenceName) ?? 0;
    countsByReferenceName.set(baseReferenceName, occurrence + 1);
    externalAgentReferenceNamesById[externalAgentId] =
      occurrence === 0 ? baseReferenceName : `${baseReferenceName}${occurrence}`;
  }

  return externalAgentReferenceNamesById;
}

function buildExternalAgentReferencePathById(
  project: FullProjectDefinition
): Record<string, string> {
  const externalAgentEntries = Object.entries(project.externalAgents ?? {}).map(
    ([externalAgentId, externalAgentData]) =>
      [
        externalAgentId,
        { name: resolveExternalAgentNamingSeed(externalAgentId, externalAgentData) },
      ] as [string, { name: string }]
  );
  const externalAgentFileNamesById = buildSequentialNameFileNames(externalAgentEntries);
  const externalAgentReferencePathById: Record<string, string> = {};

  for (const [externalAgentId] of externalAgentEntries) {
    externalAgentReferencePathById[externalAgentId] = stripExtension(
      externalAgentFileNamesById[externalAgentId]
    );
  }

  return externalAgentReferencePathById;
}

function buildSubAgentReferenceNamesById(
  project: FullProjectDefinition,
  agentIds?: Iterable<string>
): Record<string, string> {
  const subAgentReferenceNamesById: Record<string, string> = {};
  const candidateAgentIds =
    agentIds !== undefined ? [...agentIds] : Object.keys(project.agents ?? {});
  for (const agentId of candidateAgentIds) {
    const agentData = project.agents?.[agentId];
    const subAgents = asRecord(agentData?.subAgents);
    if (!subAgents) {
      continue;
    }

    for (const [subAgentId, subAgentData] of Object.entries(subAgents)) {
      const subAgentName = asRecord(subAgentData)?.name;
      subAgentReferenceNamesById[subAgentId] = resolveSubAgentVariableName(
        subAgentId,
        typeof subAgentName === 'string' ? subAgentName : undefined
      );
    }
  }

  return subAgentReferenceNamesById;
}

function buildSubAgentReferencePathById(
  project: FullProjectDefinition,
  agentIds?: Iterable<string>
): Record<string, string> {
  const subAgentReferencePathById: Record<string, string> = {};
  const candidateAgentIds =
    agentIds !== undefined ? [...agentIds] : Object.keys(project.agents ?? {});
  for (const agentId of candidateAgentIds) {
    const agentData = project.agents?.[agentId];
    const subAgents = asRecord(agentData?.subAgents);
    if (!subAgents) {
      continue;
    }

    for (const [subAgentId, subAgentData] of Object.entries(subAgents)) {
      const subAgentName = asRecord(subAgentData)?.name;
      subAgentReferencePathById[subAgentId] = stripExtension(
        buildComponentFileName(
          subAgentId,
          typeof subAgentName === 'string' ? subAgentName : undefined
        )
      );
    }
  }

  return subAgentReferencePathById;
}

function buildAgentReferenceNamesById(project: FullProjectDefinition): Record<string, string> {
  const agentReferenceNamesById: Record<string, string> = {};
  for (const agentId of Object.keys(project.agents ?? {})) {
    agentReferenceNamesById[agentId] = toCamelCase(agentId);
  }
  return agentReferenceNamesById;
}

function buildAgentReferencePathById(project: FullProjectDefinition): Record<string, string> {
  const agentReferencePathById: Record<string, string> = {};
  for (const [agentId, agentData] of Object.entries(project.agents ?? {})) {
    const agentName = asRecord(agentData)?.name;
    agentReferencePathById[agentId] = stripExtension(
      buildComponentFileName(agentId, typeof agentName === 'string' ? agentName : undefined)
    );
  }
  return agentReferencePathById;
}

function toExternalAgentReferenceName(input: string): string {
  const base = toCamelCase(input);
  return base.endsWith('Agent') ? base : `${base}Agent`;
}

export function resolveExternalAgentNamingSeed(
  externalAgentId: string,
  externalAgentData: unknown
): string {
  if (isHumanReadableId(externalAgentId)) {
    return externalAgentId;
  }

  const externalAgentName = asRecord(externalAgentData)?.name;
  if (typeof externalAgentName === 'string' && externalAgentName.length > 0) {
    return externalAgentName;
  }

  return externalAgentId;
}

export function resolveToolModulePath(filePath: string): string {
  const normalizedFilePath = normalizeFilePath(filePath);
  const toolsSegment = '/tools/';
  const toolsIndex = normalizedFilePath.lastIndexOf(toolsSegment);
  if (toolsIndex >= 0) {
    let modulePath = stripExtension(normalizedFilePath.slice(toolsIndex + toolsSegment.length));
    if (modulePath.endsWith('/index')) {
      modulePath = modulePath.slice(0, -'/index'.length);
    }
    if (modulePath.length > 0) {
      return modulePath;
    }
  }

  const baseModulePath = stripExtension(basename(normalizedFilePath));
  if (baseModulePath === 'index') {
    return stripExtension(basename(dirname(normalizedFilePath)));
  }
  return baseModulePath;
}

export function resolveProjectFilePath(projectRoot: string, filePath: string): string {
  if (filePath.startsWith('/')) {
    return filePath;
  }
  return join(projectRoot, filePath);
}

export function normalizeFilePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

export function buildSequentialNameFileNames(
  entries: Array<[string, unknown]>
): Record<string, string> {
  const countsByStem = new Map<string, number>();
  const fileNamesById: Record<string, string> = {};

  for (const [componentId, componentData] of entries) {
    const name = asRecord(componentData)?.name;
    const baseStem = resolveNameFileStem(componentId, typeof name === 'string' ? name : undefined);
    const occurrence = countsByStem.get(baseStem) ?? 0;
    countsByStem.set(baseStem, occurrence + 1);

    const stem = occurrence === 0 ? baseStem : `${baseStem}-${occurrence}`;
    fileNamesById[componentId] = `${stem}.ts`;
  }

  return fileNamesById;
}

function resolveNameFileStem(componentId: string, name: string | undefined): string {
  const nameStem = name ? toKebabCase(name) : '';
  if (nameStem.length > 0) {
    return nameStem;
  }

  const idStem = toKebabCase(componentId);
  if (idStem.length > 0) {
    return idStem;
  }

  return componentId;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}
