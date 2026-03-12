import { basename, join } from 'node:path';
import { Node } from 'ts-morph';
import {
  asRecord,
  collectTemplateVariablesFromValues,
  extractContextConfigData,
  extractReferenceIds,
  getObjectKeys,
  inferHeadersReferenceFromContextConfig,
  isContextConfigInitializer,
  stripExtension,
} from './collector-common';
import type { ComponentRegistry, ComponentType } from './component-registry';
import { readFileScope } from './file-scope';
import {
  normalizeFilePath,
  resolveProjectFilePath,
  resolveToolModulePath,
} from './generation-resolver';
import {
  assignComponentReferenceOverrideForProject,
  type ContextTemplateReferences,
  type GenerationContext,
  type ProjectReferenceOverrides,
  type ProjectReferenceOverrideType,
  type ProjectReferencePathOverrides,
  type SubAgentDependencyReferences,
  type SubAgentReferenceOverrides,
  type SubAgentReferenceOverrideType,
  type SubAgentReferencePathOverrides,
} from './generation-types';
import {
  buildComponentFileName,
  toCamelCase,
  toCredentialReferenceName,
  toKebabCase,
  toToolReferenceName,
} from './utils';

export function collectContextConfigCredentialReferenceOverrides(
  context: GenerationContext,
  contextConfigData: Record<string, unknown>
): Record<string, string> | undefined {
  const contextVariables = asRecord(contextConfigData.contextVariables);
  if (!contextVariables) {
    return;
  }

  const overrides: Record<string, string> = {};
  for (const contextVariable of Object.values(contextVariables)) {
    const contextVariableRecord = asRecord(contextVariable);
    const credentialReferenceId =
      contextVariableRecord && typeof contextVariableRecord.credentialReferenceId === 'string'
        ? contextVariableRecord.credentialReferenceId
        : undefined;
    if (!credentialReferenceId) {
      continue;
    }

    const credentialReferenceName =
      context.resolver.getCredentialReferenceName(credentialReferenceId);
    if (credentialReferenceName) {
      overrides[credentialReferenceId] = credentialReferenceName;
    }
  }

  return Object.keys(overrides).length ? overrides : undefined;
}

export function collectContextConfigCredentialReferencePathOverrides(
  context: GenerationContext,
  contextConfigData: Record<string, unknown>
): Record<string, string> | undefined {
  const contextVariables = asRecord(contextConfigData.contextVariables);
  if (!contextVariables) {
    return;
  }

  const overrides: Record<string, string> = {};
  for (const contextVariable of Object.values(contextVariables)) {
    const contextVariableRecord = asRecord(contextVariable);
    const credentialReferenceId =
      contextVariableRecord && typeof contextVariableRecord.credentialReferenceId === 'string'
        ? contextVariableRecord.credentialReferenceId
        : undefined;
    if (!credentialReferenceId) {
      continue;
    }

    const credentialReferencePath =
      context.resolver.getCredentialReferencePath(credentialReferenceId);
    if (credentialReferencePath) {
      overrides[credentialReferenceId] = credentialReferencePath;
    }
  }

  return Object.keys(overrides).length ? overrides : undefined;
}

export function collectContextConfigHeadersReferenceOverride(
  context: GenerationContext,
  contextConfigId: string,
  filePath: string
): string | undefined {
  if (!context.existingComponentRegistry) {
    return;
  }

  const fileScope = readFileScope(filePath);
  if (!fileScope) {
    return;
  }

  const { sourceFile } = fileScope;

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !isContextConfigInitializer(initializer)) {
      continue;
    }

    const [configArg] = initializer.getArguments();
    if (!configArg || !Node.isObjectLiteralExpression(configArg)) {
      continue;
    }

    const idProperty = configArg.getProperty('id');
    if (!idProperty || !Node.isPropertyAssignment(idProperty)) {
      continue;
    }
    const idInitializer = idProperty.getInitializer();
    if (!idInitializer || !Node.isStringLiteral(idInitializer)) {
      continue;
    }
    if (idInitializer.getLiteralValue() !== contextConfigId) {
      continue;
    }

    const headersProperty = configArg.getProperty('headers');
    if (!headersProperty) {
      return;
    }

    if (Node.isShorthandPropertyAssignment(headersProperty)) {
      return headersProperty.getName();
    }

    if (!Node.isPropertyAssignment(headersProperty)) {
      return;
    }

    const headersInitializer = headersProperty.getInitializer();
    if (!headersInitializer) {
      return;
    }

    if (Node.isIdentifier(headersInitializer)) {
      return headersInitializer.getText();
    }

    if (Node.isAsExpression(headersInitializer)) {
      const valueExpression = headersInitializer.getExpression();
      if (Node.isIdentifier(valueExpression)) {
        return valueExpression.getText();
      }
    }

    return;
  }

  return;
}

export function collectSubAgentReferenceOverrides(
  context: GenerationContext,
  agentData: Record<string, unknown>,
  agentFilePath: string
): Record<string, { name: string; local?: boolean }> {
  const subAgentIds = new Set<string>(extractReferenceIds(agentData.subAgents));
  if (typeof agentData.defaultSubAgentId === 'string' && agentData.defaultSubAgentId.length > 0) {
    subAgentIds.add(agentData.defaultSubAgentId);
  }

  if (!subAgentIds.size) {
    return {};
  }

  const overrides: Record<string, { name: string; local?: boolean }> = {};
  for (const subAgentId of subAgentIds) {
    const generatedReferenceName = context.resolver.getSubAgentReferenceName(subAgentId);
    if (generatedReferenceName) {
      overrides[subAgentId] = { name: generatedReferenceName };
    }

    const existingSubAgent = context.resolver.getExistingComponent(subAgentId, 'subAgents');
    if (!existingSubAgent?.name) {
      continue;
    }

    const existingSubAgentFilePath = resolveProjectFilePath(
      context.paths.projectRoot,
      existingSubAgent.filePath
    );
    const isLocal =
      normalizeFilePath(existingSubAgentFilePath) === normalizeFilePath(agentFilePath);
    overrides[subAgentId] = isLocal
      ? { name: existingSubAgent.name, local: true }
      : { name: existingSubAgent.name };
  }

  return overrides;
}

export function collectSubAgentReferencePathOverrides(
  context: GenerationContext,
  agentData: Record<string, unknown>
): Record<string, string> {
  const subAgentIds = new Set<string>(extractReferenceIds(agentData.subAgents));
  if (typeof agentData.defaultSubAgentId === 'string' && agentData.defaultSubAgentId.length > 0) {
    subAgentIds.add(agentData.defaultSubAgentId);
  }

  if (!subAgentIds.size) {
    return {};
  }

  const subAgents = asRecord(agentData.subAgents);
  const overrides: Record<string, string> = {};

  for (const subAgentId of subAgentIds) {
    const fallbackReferencePath = context.resolver.getSubAgentReferencePath(subAgentId);
    const subAgentData = asRecord(subAgents?.[subAgentId]);
    const subAgentName = typeof subAgentData?.name === 'string' ? subAgentData.name : undefined;
    const subAgentFilePath = context.resolver.resolveOutputFilePath(
      'subAgents',
      subAgentId,
      join(
        context.paths.agentsDir,
        'sub-agents',
        fallbackReferencePath
          ? `${fallbackReferencePath}.ts`
          : buildComponentFileName(subAgentId, subAgentName)
      )
    );
    overrides[subAgentId] = stripExtension(basename(subAgentFilePath));
  }

  return overrides;
}

export function collectContextTemplateReferences(
  context: GenerationContext,
  agentData: Record<string, unknown>,
  targetFilePath: string,
  promptValues: Array<string | undefined>
): ContextTemplateReferences | undefined {
  const contextConfig = extractContextConfigData(agentData);
  const contextConfigId = contextConfig?.id;
  if (!contextConfigId) {
    return;
  }

  const contextConfigFilePath = context.resolver.resolveOutputFilePath(
    'contextConfigs',
    contextConfigId,
    join(context.paths.contextConfigsDir, `${contextConfigId}.ts`)
  );
  const isLocal = normalizeFilePath(contextConfigFilePath) === normalizeFilePath(targetFilePath);

  const contextConfigReference =
    collectAgentContextConfigReferenceOverride(context, agentData, targetFilePath) ??
    (isLocal
      ? { name: toCamelCase(contextConfigId), local: true }
      : { name: toCamelCase(contextConfigId) });

  const templateVariables = collectTemplateVariablesFromValues(promptValues);
  const hasHeadersTemplateVariables = templateVariables.some((variableName) =>
    variableName.startsWith('headers.')
  );
  let headersReferenceName =
    collectContextConfigHeadersReferenceOverride(context, contextConfigId, contextConfigFilePath) ??
    inferHeadersReferenceFromContextConfig(contextConfig, contextConfigId);

  if (!headersReferenceName && hasHeadersTemplateVariables) {
    headersReferenceName = `${toCamelCase(contextConfigId)}Headers`;
  }

  return {
    contextConfigId,
    contextConfigReference,
    ...(headersReferenceName && {
      contextConfigHeadersReference: isLocal
        ? { name: headersReferenceName, local: true }
        : { name: headersReferenceName },
    }),
  };
}

export function collectSubAgentDependencyReferenceOverrides(
  context: GenerationContext,
  subAgentData: Record<string, unknown>
): SubAgentDependencyReferences | undefined {
  const registry = context.existingComponentRegistry;
  const referenceOverrides: SubAgentReferenceOverrides = {};
  const referencePathOverrides: SubAgentReferencePathOverrides = {};

  const assignSubAgentReferenceOverrides = (subAgentId: string): void => {
    const subAgentReferenceName = context.resolver.getSubAgentReferenceName(subAgentId);
    if (subAgentReferenceName) {
      assignReferenceOverride(referenceOverrides, 'subAgents', subAgentId, subAgentReferenceName);
    }

    const subAgentReferencePath = context.resolver.getSubAgentReferencePath(subAgentId);
    if (subAgentReferencePath) {
      assignReferencePathOverride(
        referencePathOverrides,
        'subAgents',
        subAgentId,
        subAgentReferencePath
      );
    }
  };

  const assignAgentReferenceOverrides = (agentId: string): void => {
    const agentReferenceName = context.resolver.getAgentReferenceName(agentId);
    if (agentReferenceName) {
      assignReferenceOverride(referenceOverrides, 'agents', agentId, agentReferenceName);
    }

    const agentReferencePath = context.resolver.getAgentReferencePath(agentId);
    if (agentReferencePath) {
      assignReferencePathOverride(referencePathOverrides, 'agents', agentId, agentReferencePath);
    }
  };

  const assignExternalAgentReferenceOverrides = (externalAgentId: string): void => {
    const externalAgentReferenceName =
      context.resolver.getExternalAgentReferenceName(externalAgentId);
    if (externalAgentReferenceName) {
      assignReferenceOverride(
        referenceOverrides,
        'externalAgents',
        externalAgentId,
        externalAgentReferenceName
      );
    }

    const externalAgentReferencePath =
      context.resolver.getExternalAgentReferencePath(externalAgentId);
    if (externalAgentReferencePath) {
      assignReferencePathOverride(
        referencePathOverrides,
        'externalAgents',
        externalAgentId,
        externalAgentReferencePath
      );
    }
  };

  const canUse = Array.isArray(subAgentData.canUse) ? subAgentData.canUse : [];
  for (const item of canUse) {
    const canUseRecord = asRecord(item);
    const toolId =
      typeof item === 'string'
        ? item
        : canUseRecord && typeof canUseRecord.toolId === 'string'
          ? canUseRecord.toolId
          : undefined;
    if (!toolId) {
      continue;
    }

    const toolReferenceName =
      context.resolver.getToolReferenceName(toolId) ?? toToolReferenceName(toolId);
    assignReferenceOverride(referenceOverrides, 'tools', toolId, toolReferenceName);

    const toolReferencePath = context.resolver.getToolReferencePath(toolId) ?? toKebabCase(toolId);
    assignReferencePathOverride(referencePathOverrides, 'tools', toolId, toolReferencePath);

    if (registry) {
      assignComponentReferenceOverride(registry, referenceOverrides, 'tools', toolId, 'tools');
      assignComponentReferenceOverride(
        registry,
        referenceOverrides,
        'tools',
        toolId,
        'functionTools'
      );
    }
  }

  const canDelegateTo = Array.isArray(subAgentData.canDelegateTo) ? subAgentData.canDelegateTo : [];
  for (const item of canDelegateTo) {
    if (typeof item === 'string') {
      assignSubAgentReferenceOverrides(item);
      assignAgentReferenceOverrides(item);
      assignExternalAgentReferenceOverrides(item);
      continue;
    }

    const canDelegateRecord = asRecord(item);
    if (typeof canDelegateRecord?.subAgentId === 'string') {
      assignSubAgentReferenceOverrides(canDelegateRecord.subAgentId);
    }
    if (typeof canDelegateRecord?.agentId === 'string') {
      assignAgentReferenceOverrides(canDelegateRecord.agentId);
    }
    if (typeof canDelegateRecord?.externalAgentId === 'string') {
      assignExternalAgentReferenceOverrides(canDelegateRecord.externalAgentId);
    }
  }

  const canTransferTo = extractReferenceIds(subAgentData.canTransferTo);
  for (const transferTargetId of canTransferTo) {
    assignSubAgentReferenceOverrides(transferTargetId);
    assignAgentReferenceOverrides(transferTargetId);
    assignExternalAgentReferenceOverrides(transferTargetId);
  }

  if (registry) {
    for (const item of canDelegateTo) {
      if (typeof item === 'string') {
        assignFirstMatchingComponentReferenceOverride(registry, referenceOverrides, item, [
          ['subAgents', 'subAgents'],
          ['agents', 'agents'],
          ['externalAgents', 'externalAgents'],
        ]);
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'subAgents',
          item,
          'subAgents'
        );
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'agents',
          item,
          'agents'
        );
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'externalAgents',
          item,
          'externalAgents'
        );
        continue;
      }

      const canDelegateRecord = asRecord(item);
      if (!canDelegateRecord) {
        continue;
      }

      if (typeof canDelegateRecord.subAgentId === 'string') {
        assignComponentReferenceOverride(
          registry,
          referenceOverrides,
          'subAgents',
          canDelegateRecord.subAgentId,
          'subAgents'
        );
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'subAgents',
          canDelegateRecord.subAgentId,
          'subAgents'
        );
        continue;
      }
      if (typeof canDelegateRecord.agentId === 'string') {
        assignComponentReferenceOverride(
          registry,
          referenceOverrides,
          'agents',
          canDelegateRecord.agentId,
          'agents'
        );
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'agents',
          canDelegateRecord.agentId,
          'agents'
        );
        continue;
      }
      if (typeof canDelegateRecord.externalAgentId === 'string') {
        assignComponentReferenceOverride(
          registry,
          referenceOverrides,
          'externalAgents',
          canDelegateRecord.externalAgentId,
          'externalAgents'
        );
        assignComponentReferencePathOverride(
          registry,
          referencePathOverrides,
          'externalAgents',
          canDelegateRecord.externalAgentId,
          'externalAgents'
        );
      }
    }

    for (const transferTargetId of canTransferTo) {
      assignFirstMatchingComponentReferenceOverride(
        registry,
        referenceOverrides,
        transferTargetId,
        [
          ['subAgents', 'subAgents'],
          ['agents', 'agents'],
          ['externalAgents', 'externalAgents'],
        ]
      );
      assignComponentReferencePathOverride(
        registry,
        referencePathOverrides,
        'subAgents',
        transferTargetId,
        'subAgents'
      );
      assignComponentReferencePathOverride(
        registry,
        referencePathOverrides,
        'agents',
        transferTargetId,
        'agents'
      );
      assignComponentReferencePathOverride(
        registry,
        referencePathOverrides,
        'externalAgents',
        transferTargetId,
        'externalAgents'
      );
    }

    const dataComponentIds = extractReferenceIds(subAgentData.dataComponents);
    for (const dataComponentId of dataComponentIds) {
      assignComponentReferenceOverride(
        registry,
        referenceOverrides,
        'dataComponents',
        dataComponentId,
        'dataComponents'
      );
    }

    const artifactComponentIds = extractReferenceIds(subAgentData.artifactComponents);
    for (const artifactComponentId of artifactComponentIds) {
      assignComponentReferenceOverride(
        registry,
        referenceOverrides,
        'artifactComponents',
        artifactComponentId,
        'artifactComponents'
      );
    }
  }

  return Object.keys(referenceOverrides).length > 0 ||
    Object.keys(referencePathOverrides).length > 0
    ? {
        ...(Object.keys(referenceOverrides).length > 0 && { referenceOverrides }),
        ...(Object.keys(referencePathOverrides).length > 0 && { referencePathOverrides }),
      }
    : undefined;
}

export function collectProjectReferenceOverrides(
  context: GenerationContext
): ProjectReferenceOverrides | undefined {
  const overrides: ProjectReferenceOverrides = {};
  addProjectNameBasedReferenceOverrides(context, overrides);

  const registry = context.existingComponentRegistry;
  if (!registry) {
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  }

  for (const agentId of context.completeAgentIds) {
    assignComponentReferenceOverrideForProject(registry, overrides, 'agents', agentId, 'agents');
  }

  const toolIds = getObjectKeys(context.project.tools);
  for (const toolId of toolIds) {
    if (
      assignComponentReferenceOverrideForProject(
        registry,
        overrides,
        'tools',
        toolId,
        'functionTools'
      )
    ) {
      continue;
    }

    assignComponentReferenceOverrideForProject(registry, overrides, 'tools', toolId, 'tools');
  }

  const externalAgentIds = getObjectKeys(context.project.externalAgents);
  for (const externalAgentId of externalAgentIds) {
    assignComponentReferenceOverrideForProject(
      registry,
      overrides,
      'externalAgents',
      externalAgentId,
      'externalAgents'
    );
  }

  const dataComponentIds = getObjectKeys(context.project.dataComponents);
  for (const dataComponentId of dataComponentIds) {
    assignComponentReferenceOverrideForProject(
      registry,
      overrides,
      'dataComponents',
      dataComponentId,
      'dataComponents'
    );
  }

  const artifactComponentIds = getObjectKeys(context.project.artifactComponents);
  for (const artifactComponentId of artifactComponentIds) {
    assignComponentReferenceOverrideForProject(
      registry,
      overrides,
      'artifactComponents',
      artifactComponentId,
      'artifactComponents'
    );
  }

  const credentialIds = getObjectKeys(context.project.credentialReferences);
  for (const credentialId of credentialIds) {
    assignComponentReferenceOverrideForProject(
      registry,
      overrides,
      'credentialReferences',
      credentialId,
      'credentials'
    );
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function collectProjectReferencePathOverrides(
  context: GenerationContext
): ProjectReferencePathOverrides | undefined {
  const overrides: ProjectReferencePathOverrides = {};

  if (context.project.agents) {
    for (const agentId of context.completeAgentIds) {
      const referencePath = context.resolver.getAgentReferencePath(agentId);
      if (referencePath) {
        assignProjectReferenceOverride(overrides, 'agents', agentId, referencePath);
      }
    }
  }

  for (const toolId of getObjectKeys(context.project.tools)) {
    const referencePath = context.resolver.getToolReferencePath(toolId);
    if (referencePath) {
      assignProjectReferenceOverride(overrides, 'tools', toolId, referencePath);
    }
  }

  for (const credentialId of getObjectKeys(context.project.credentialReferences)) {
    const referencePath = context.resolver.getCredentialReferencePath(credentialId);
    if (referencePath) {
      assignProjectReferenceOverride(
        overrides,
        'credentialReferences',
        credentialId,
        referencePath
      );
    }
  }

  for (const externalAgentId of getObjectKeys(context.project.externalAgents)) {
    const referencePath = context.resolver.getExternalAgentReferencePath(externalAgentId);
    if (referencePath) {
      assignProjectReferenceOverride(overrides, 'externalAgents', externalAgentId, referencePath);
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function collectAgentContextConfigReferenceOverride(
  context: GenerationContext,
  agentData: Record<string, unknown>,
  agentFilePath: string
): { name: string; local?: boolean } | undefined {
  const contextConfig = extractContextConfigData(agentData);
  const contextConfigId = contextConfig?.id;
  if (!contextConfigId) {
    return;
  }

  const existingContextConfig = context.resolver.getExistingComponent(
    contextConfigId,
    'contextConfigs'
  );
  if (!existingContextConfig?.name) {
    return;
  }

  const existingContextConfigFilePath = resolveProjectFilePath(
    context.paths.projectRoot,
    existingContextConfig.filePath
  );
  const isLocal =
    normalizeFilePath(existingContextConfigFilePath) === normalizeFilePath(agentFilePath);
  return isLocal
    ? { name: existingContextConfig.name, local: true }
    : { name: existingContextConfig.name };
}

function addProjectNameBasedReferenceOverrides(
  context: GenerationContext,
  overrides: ProjectReferenceOverrides
): void {
  for (const toolId of getObjectKeys(context.project.tools)) {
    const referenceName = context.resolver.getToolReferenceName(toolId);
    if (referenceName) {
      assignProjectReferenceOverride(overrides, 'tools', toolId, referenceName);
    }
  }

  for (const [credentialId, credentialData] of Object.entries(
    context.project.credentialReferences ?? {}
  )) {
    const credentialName = asRecord(credentialData)?.name;
    const referenceName =
      typeof credentialName === 'string' && credentialName.length > 0
        ? toCredentialReferenceName(credentialName)
        : toCredentialReferenceName(credentialId);
    assignProjectReferenceOverride(overrides, 'credentialReferences', credentialId, referenceName);
  }

  for (const externalAgentId of getObjectKeys(context.project.externalAgents)) {
    const referenceName = context.resolver.getExternalAgentReferenceName(externalAgentId);
    if (referenceName) {
      assignProjectReferenceOverride(overrides, 'externalAgents', externalAgentId, referenceName);
    }
  }
}

function assignFirstMatchingComponentReferenceOverride(
  registry: ComponentRegistry,
  overrides: SubAgentReferenceOverrides,
  componentId: string,
  candidates: Array<[SubAgentReferenceOverrideType, ComponentType]>
): void {
  for (const [overrideType, componentType] of candidates) {
    const component = registry.get(componentId, componentType);
    if (!component?.name) {
      continue;
    }

    assignReferenceOverride(overrides, overrideType, componentId, component.name);
    return;
  }
}

function assignComponentReferenceOverride(
  registry: ComponentRegistry,
  overrides: SubAgentReferenceOverrides,
  overrideType: SubAgentReferenceOverrideType,
  componentId: string,
  componentType: ComponentType
): void {
  const component = registry.get(componentId, componentType);
  if (!component?.name) {
    return;
  }

  assignReferenceOverride(overrides, overrideType, componentId, component.name);
}

function assignComponentReferencePathOverride(
  registry: ComponentRegistry,
  overrides: SubAgentReferencePathOverrides,
  overrideType: 'tools' | 'subAgents' | 'agents' | 'externalAgents',
  componentId: string,
  componentType: ComponentType
): void {
  const component = registry.get(componentId, componentType);
  if (!component?.filePath) {
    return;
  }

  const referencePath =
    componentType === 'tools' || componentType === 'functionTools'
      ? resolveToolModulePath(component.filePath)
      : stripExtension(basename(component.filePath));
  assignReferencePathOverride(overrides, overrideType, componentId, referencePath);
}

function assignReferenceOverride(
  overrides: SubAgentReferenceOverrides,
  overrideType: SubAgentReferenceOverrideType,
  componentId: string,
  referenceName: string
): void {
  const overrideMap = overrides[overrideType] ?? {};
  overrideMap[componentId] = referenceName;
  overrides[overrideType] = overrideMap;
}

function assignReferencePathOverride(
  overrides: SubAgentReferencePathOverrides,
  overrideType: 'tools' | 'subAgents' | 'agents' | 'externalAgents',
  componentId: string,
  referencePath: string
): void {
  const overrideMap = overrides[overrideType] ?? {};
  overrideMap[componentId] = referencePath;
  overrides[overrideType] = overrideMap;
}

function assignProjectReferenceOverride(
  overrides: ProjectReferenceOverrides | ProjectReferencePathOverrides,
  overrideType: ProjectReferenceOverrideType,
  componentId: string,
  referenceName: string
): void {
  const overrideMap = overrides[overrideType] ?? {};
  overrideMap[componentId] = referenceName;
  overrides[overrideType] = overrideMap;
}
