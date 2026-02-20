import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { buildComponentRegistryFromParsing } from '../pull-v3/component-parser';
import type { ComponentRegistry, ComponentType } from '../pull-v3/utils/component-registry';
import { generateAgentDefinition } from './agent-generator';
import { generateArtifactComponentDefinition } from './artifact-component-generator';
import { generateContextConfigDefinition } from './context-config-generator';
import { generateCredentialDefinition } from './credential-generator';
import { generateDataComponentDefinition } from './data-component-generator';
import { mergeGeneratedModule } from './module-merge';
import { generateProjectDefinition } from './project-generator';
import { generateStatusComponentDefinition } from './status-component-generator';
import { generateSubAgentDefinition } from './sub-agent-generator';
import { generateTriggerDefinition } from './trigger-generator';
import { createInMemoryProject } from './utils';

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

export interface IntrospectOptions {
  project: FullProjectDefinition;
  paths: ProjectPaths;
  /** @default "merge" */
  writeMode?: 'merge' | 'overwrite';
  /** @default false */
  failOnUnsupportedComponents?: boolean;
  /** @default false */
  debug?: boolean;
}

interface GenerationContext {
  project: FullProjectDefinition;
  paths: ProjectPaths;
  completeAgentIds: Set<string>;
  existingComponentRegistry?: ComponentRegistry;
}

interface GenerationRecord<TPayload> {
  id: string;
  filePath: string;
  payload: TPayload;
}

interface GenerationTask<TPayload> {
  type: string;
  collect: (context: GenerationContext) => GenerationRecord<TPayload>[];
  generate: (payload: TPayload) => SourceFile;
}

interface SkippedAgent {
  id: string;
  reason: string;
}

interface UnsupportedComponentCounts {
  tools: number;
  functionTools: number;
  functions: number;
  externalAgents: number;
}

type SubAgentReferenceOverrideType =
  | 'tools'
  | 'subAgents'
  | 'agents'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents';

type SubAgentReferenceOverrides = Partial<
  Record<SubAgentReferenceOverrideType, Record<string, string>>
>;

type ProjectReferenceOverrideType =
  | 'agents'
  | 'tools'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents'
  | 'credentialReferences';

type ProjectReferenceOverrides = Partial<
  Record<ProjectReferenceOverrideType, Record<string, string>>
>;

export async function introspectGenerate({
  project,
  paths,
  writeMode = 'merge',
  failOnUnsupportedComponents = false,
  debug = false,
}: IntrospectOptions): Promise<void> {
  validateProject(project);

  const skippedAgents: SkippedAgent[] = [];
  const completeAgentIds = collectCompleteAgentIds(project, skippedAgents);
  const existingComponentRegistry =
    writeMode === 'merge' ? buildComponentRegistryFromParsing(paths.projectRoot, debug) : undefined;
  const context: GenerationContext = {
    project,
    paths,
    completeAgentIds,
    existingComponentRegistry,
  };
  const tasks = createGenerationTasks();
  const failures: string[] = [];
  const generatedFiles: string[] = [];

  for (const task of tasks) {
    const records = task.collect(context);
    for (const record of records) {
      try {
        const sourceFile = task.generate(record.payload);
        writeTypeScriptFile(record.filePath, sourceFile.getFullText(), writeMode);
        generatedFiles.push(record.filePath);
      } catch (error) {
        failures.push(
          `${task.type}:${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  const unsupportedCounts = collectUnsupportedComponentCounts(project);
  if (failOnUnsupportedComponents && hasUnsupportedComponents(unsupportedCounts)) {
    failures.push(formatUnsupportedComponentsError(unsupportedCounts));
  }

  if (failures.length > 0) {
    throw new Error(`Inkeep Pull failed:\n${failures.join('\n')}`);
  }

  if (debug) {
    console.log(`Generated ${generatedFiles.length} files`);
    if (skippedAgents.length > 0) {
      console.log(
        `Skipped ${skippedAgents.length} agent(s): ${skippedAgents
          .map((agent) => `${agent.id} (${agent.reason})`)
          .join(', ')}`
      );
    }
    if (hasUnsupportedComponents(unsupportedCounts)) {
      console.log(formatUnsupportedComponentsWarning(unsupportedCounts));
    }
  }
}

function createGenerationTasks(): Array<GenerationTask<any>> {
  return [
    {
      type: 'credential',
      collect: collectCredentialRecords,
      generate: generateCredentialDefinition,
    },
    {
      type: 'artifact-component',
      collect: collectArtifactComponentRecords,
      generate: generateArtifactComponentDefinition,
    },
    {
      type: 'data-component',
      collect: collectDataComponentRecords,
      generate: generateDataComponentDefinition,
    },
    {
      type: 'context-config',
      collect: collectContextConfigRecords,
      generate: generateContextConfigDefinition,
    },
    {
      type: 'trigger',
      collect: collectTriggerRecords,
      generate: generateTriggerDefinition,
    },
    {
      type: 'sub-agent',
      collect: collectSubAgentRecords,
      generate: generateSubAgentDefinition,
    },
    {
      type: 'status-component',
      collect: collectStatusComponentRecords,
      generate: generateStatusComponentDefinition,
    },
    {
      type: 'agent',
      collect: collectAgentRecords,
      generate: generateAgentDefinition,
    },
    {
      type: 'project',
      collect: collectProjectRecord,
      generate: generateProjectDefinition,
    },
  ];
}

function collectCredentialRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateCredentialDefinition>[0]>> {
  if (!context.project.credentialReferences) {
    return [];
  }

  return Object.entries(context.project.credentialReferences).map(
    ([credentialId, credentialData]) => ({
      id: credentialId,
      filePath: resolveRecordFilePath(
        context,
        'credentials',
        credentialId,
        join(context.paths.credentialsDir, `${credentialId}.ts`)
      ),
      payload: {
        credentialId,
        ...credentialData,
      } as Parameters<typeof generateCredentialDefinition>[0],
    })
  );
}

function collectArtifactComponentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateArtifactComponentDefinition>[0]>> {
  if (!context.project.artifactComponents) {
    return [];
  }

  return Object.entries(context.project.artifactComponents).map(
    ([artifactComponentId, artifactComponentData]) => ({
      id: artifactComponentId,
      filePath: resolveRecordFilePath(
        context,
        'artifactComponents',
        artifactComponentId,
        join(context.paths.artifactComponentsDir, `${artifactComponentId}.ts`)
      ),
      payload: {
        artifactComponentId,
        ...artifactComponentData,
      } as Parameters<typeof generateArtifactComponentDefinition>[0],
    })
  );
}

function collectDataComponentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateDataComponentDefinition>[0]>> {
  if (!context.project.dataComponents) {
    return [];
  }

  return Object.entries(context.project.dataComponents).map(([dataComponentId, dataComponent]) => ({
    id: dataComponentId,
    filePath: resolveRecordFilePath(
      context,
      'dataComponents',
      dataComponentId,
      join(context.paths.dataComponentsDir, `${dataComponentId}.ts`)
    ),
    payload: {
      dataComponentId,
      ...dataComponent,
    } as Parameters<typeof generateDataComponentDefinition>[0],
  }));
}

function collectContextConfigRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateContextConfigDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const contextConfigRecordsById = new Map<
    string,
    GenerationRecord<Parameters<typeof generateContextConfigDefinition>[0]>
  >();

  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    const contextConfig = agentData ? asRecord(agentData.contextConfig) : undefined;
    if (!agentData || !contextConfig) {
      continue;
    }

    const contextConfigId = typeof contextConfig.id === 'string' ? contextConfig.id : '';
    if (!contextConfigId) {
      continue;
    }

    if (!contextConfigRecordsById.has(contextConfigId)) {
      const contextConfigFilePath = resolveRecordFilePath(
        context,
        'contextConfigs',
        contextConfigId,
        join(context.paths.contextConfigsDir, `${contextConfigId}.ts`)
      );
      const credentialReferenceOverrides = collectContextConfigCredentialReferenceOverrides(
        context,
        contextConfig
      );
      const headersReferenceOverride = collectContextConfigHeadersReferenceOverride(
        context,
        contextConfigId,
        contextConfigFilePath
      );
      contextConfigRecordsById.set(contextConfigId, {
        id: contextConfigId,
        filePath: contextConfigFilePath,
        payload: {
          contextConfigId,
          ...contextConfig,
          ...(headersReferenceOverride && {
            headers: headersReferenceOverride,
          }),
          ...(credentialReferenceOverrides && {
            referenceOverrides: {
              credentialReferences: credentialReferenceOverrides,
            },
          }),
        } as Parameters<typeof generateContextConfigDefinition>[0],
      });
    }
  }

  return [...contextConfigRecordsById.values()];
}

function collectContextConfigCredentialReferenceOverrides(
  context: GenerationContext,
  contextConfigData: Record<string, unknown>
): Record<string, string> | undefined {
  const registry = context.existingComponentRegistry;
  if (!registry) {
    return;
  }

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

    const existingCredential = registry.get(credentialReferenceId, 'credentials');
    if (existingCredential?.name) {
      overrides[credentialReferenceId] = existingCredential.name;
    }
  }

  return Object.keys(overrides).length ? overrides : undefined;
}

function collectContextConfigHeadersReferenceOverride(
  context: GenerationContext,
  contextConfigId: string,
  filePath: string
): string | undefined {
  if (!context.existingComponentRegistry || !existsSync(filePath)) {
    return;
  }

  const sourceFile = createInMemoryProject().createSourceFile(
    'existing-context-config.ts',
    readFileSync(filePath, 'utf8'),
    { overwrite: true }
  );

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) {
      continue;
    }

    const expression = initializer.getExpression();
    if (!Node.isIdentifier(expression) || expression.getText() !== 'contextConfig') {
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

function collectTriggerRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateTriggerDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const records: Array<GenerationRecord<Parameters<typeof generateTriggerDefinition>[0]>> = [];
  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    if (!agentData?.triggers) {
      continue;
    }

    for (const [triggerId, triggerData] of Object.entries(agentData.triggers)) {
      records.push({
        id: triggerId,
        filePath: resolveRecordFilePath(
          context,
          'triggers',
          triggerId,
          join(context.paths.agentsDir, 'triggers', `${triggerId}.ts`)
        ),
        payload: {
          triggerId,
          ...triggerData,
        } as Parameters<typeof generateTriggerDefinition>[0],
      });
    }
  }

  return records;
}

function collectAgentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateAgentDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const records: Array<GenerationRecord<Parameters<typeof generateAgentDefinition>[0]>> = [];
  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    if (!agentData) {
      continue;
    }

    const agentFilePath = resolveRecordFilePath(
      context,
      'agents',
      agentId,
      join(context.paths.agentsDir, `${agentId}.ts`)
    );
    const existingAgent = context.existingComponentRegistry?.get(agentId, 'agents');
    const subAgentReferences = collectSubAgentReferenceOverrides(context, agentData, agentFilePath);
    const contextConfigReference = collectAgentContextConfigReferenceOverride(
      context,
      agentData,
      agentFilePath
    );

    records.push({
      id: agentId,
      filePath: agentFilePath,
      payload: {
        agentId,
        ...agentData,
        ...(existingAgent?.name?.length && { agentVariableName: existingAgent.name }),
        ...(Object.keys(subAgentReferences).length > 0 ? { subAgentReferences } : {}),
        ...(contextConfigReference && { contextConfigReference }),
      } as Parameters<typeof generateAgentDefinition>[0],
    });
  }
  return records;
}

function collectSubAgentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateSubAgentDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const records: Array<GenerationRecord<Parameters<typeof generateSubAgentDefinition>[0]>> = [];
  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    const subAgents = asRecord(agentData?.subAgents);
    if (!subAgents) {
      continue;
    }

    for (const [subAgentId, subAgentData] of Object.entries(subAgents)) {
      const payload = asRecord(subAgentData);
      if (!payload) {
        continue;
      }

      const referenceOverrides = collectSubAgentDependencyReferenceOverrides(context, payload);

      records.push({
        id: subAgentId,
        filePath: resolveRecordFilePath(
          context,
          'subAgents',
          subAgentId,
          join(context.paths.agentsDir, 'sub-agents', `${subAgentId}.ts`)
        ), // @ts-expect-error -- fixme
        payload: {
          subAgentId,
          ...payload,
          ...(referenceOverrides && { referenceOverrides }),
        } as Parameters<typeof generateSubAgentDefinition>[0],
      });
    }
  }

  return records;
}

function collectStatusComponentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateStatusComponentDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const statusComponentRecordsById = new Map<
    string,
    GenerationRecord<Parameters<typeof generateStatusComponentDefinition>[0]>
  >();

  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    const statusUpdates = asRecord(agentData?.statusUpdates);
    const statusComponents = Array.isArray(statusUpdates?.statusComponents)
      ? statusUpdates.statusComponents
      : [];

    for (const statusComponentData of statusComponents) {
      const payload = asRecord(statusComponentData);
      if (!payload) {
        continue;
      }

      const statusComponentId = resolveStatusComponentId(payload);
      if (!statusComponentId || statusComponentRecordsById.has(statusComponentId)) {
        continue;
      }

      statusComponentRecordsById.set(statusComponentId, {
        id: statusComponentId,
        filePath: resolveRecordFilePath(
          context,
          'statusComponents',
          statusComponentId,
          join(context.paths.statusComponentsDir, `${statusComponentId}.ts`)
        ),
        payload: {
          statusComponentId,
          ...payload,
        } as Parameters<typeof generateStatusComponentDefinition>[0],
      });
    }
  }

  return [...statusComponentRecordsById.values()];
}

function collectProjectRecord(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateProjectDefinition>[0]>> {
  const referenceOverrides = collectProjectReferenceOverrides(context);

  return [
    {
      id: context.project.id,
      filePath: resolveRecordFilePath(
        context,
        'project',
        context.project.id,
        join(context.paths.projectRoot, 'index.ts')
      ),
      payload: {
        projectId: context.project.id,
        name: context.project.name,
        description: context.project.description,
        models: context.project.models,
        stopWhen: context.project.stopWhen,
        skills: getObjectKeys(context.project.skills),
        agents: [...context.completeAgentIds],
        tools: getObjectKeys(context.project.tools),
        externalAgents: getObjectKeys(context.project.externalAgents),
        dataComponents: getObjectKeys(context.project.dataComponents),
        artifactComponents: getObjectKeys(context.project.artifactComponents),
        credentialReferences: getObjectKeys(context.project.credentialReferences),
        ...(referenceOverrides && { referenceOverrides }),
      } as Parameters<typeof generateProjectDefinition>[0],
    },
  ];
}

function validateProject(project: FullProjectDefinition): void {
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

function collectCompleteAgentIds(
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
    // @ts-expect-error -- fixme
    !Object.keys(data.subAgents).length
  ) {
    return { complete: false, reason: 'no sub-agents defined' };
  }
  return { complete: true };
}

function collectUnsupportedComponentCounts(
  project: FullProjectDefinition
): UnsupportedComponentCounts {
  return {
    tools: getObjectKeys(project.tools).length,
    functionTools: getObjectKeys(project.functionTools).length,
    functions: getObjectKeys(project.functions).length,
    externalAgents: getObjectKeys(project.externalAgents).length,
  };
}

function hasUnsupportedComponents(counts: UnsupportedComponentCounts): boolean {
  return Object.values(counts).some((value) => value > 0);
}

function formatUnsupportedComponentsError(counts: UnsupportedComponentCounts): string {
  return `Unsupported components for v4 introspect: ${formatUnsupportedCounts(counts)}`;
}

function formatUnsupportedComponentsWarning(counts: UnsupportedComponentCounts): string {
  return `Skipped unsupported components for v4 introspect: ${formatUnsupportedCounts(counts)}`;
}

function formatUnsupportedCounts(counts: UnsupportedComponentCounts): string {
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
}

function getObjectKeys(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  return Object.keys(record);
}

function resolveStatusComponentId(
  statusComponentData: Record<string, unknown>
): string | undefined {
  if (typeof statusComponentData.id === 'string') {
    return statusComponentData.id;
  }
  if (typeof statusComponentData.type === 'string') {
    return statusComponentData.type;
  }
  if (typeof statusComponentData.name === 'string') {
    return statusComponentData.name;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

function collectSubAgentReferenceOverrides(
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
    const existingSubAgent = context.existingComponentRegistry?.get(subAgentId, 'subAgents');
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

function collectAgentContextConfigReferenceOverride(
  context: GenerationContext,
  agentData: Record<string, unknown>,
  agentFilePath: string
): { name: string; local?: boolean } | undefined {
  const contextConfig =
    typeof agentData.contextConfig === 'string'
      ? { id: agentData.contextConfig }
      : asRecord(agentData.contextConfig);
  const contextConfigId =
    contextConfig && typeof contextConfig.id === 'string' ? contextConfig.id : undefined;
  if (!contextConfigId) {
    return;
  }

  const existingContextConfig = context.existingComponentRegistry?.get(
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

function collectSubAgentDependencyReferenceOverrides(
  context: GenerationContext,
  subAgentData: Record<string, unknown>
): SubAgentReferenceOverrides | undefined {
  const registry = context.existingComponentRegistry;
  if (!registry) {
    return;
  }

  const overrides: SubAgentReferenceOverrides = {};
  const canUse = Array.isArray(subAgentData.canUse) ? subAgentData.canUse : [];
  for (const item of canUse) {
    if (typeof item === 'string') {
      assignComponentReferenceOverride(registry, overrides, 'tools', item, 'tools');
      assignComponentReferenceOverride(registry, overrides, 'tools', item, 'functionTools');
      continue;
    }

    const canUseRecord = asRecord(item);
    if (!canUseRecord || typeof canUseRecord.toolId !== 'string') {
      continue;
    }

    assignComponentReferenceOverride(registry, overrides, 'tools', canUseRecord.toolId, 'tools');
    assignComponentReferenceOverride(
      registry,
      overrides,
      'tools',
      canUseRecord.toolId,
      'functionTools'
    );
  }

  const canDelegateTo = Array.isArray(subAgentData.canDelegateTo) ? subAgentData.canDelegateTo : [];
  for (const item of canDelegateTo) {
    if (typeof item === 'string') {
      assignFirstMatchingComponentReferenceOverride(registry, overrides, item, [
        ['subAgents', 'subAgents'],
        ['agents', 'agents'],
        ['externalAgents', 'externalAgents'],
      ]);
      continue;
    }

    const canDelegateRecord = asRecord(item);
    if (!canDelegateRecord) {
      continue;
    }

    if (typeof canDelegateRecord.subAgentId === 'string') {
      assignComponentReferenceOverride(
        registry,
        overrides,
        'subAgents',
        canDelegateRecord.subAgentId,
        'subAgents'
      );
      continue;
    }
    if (typeof canDelegateRecord.agentId === 'string') {
      assignComponentReferenceOverride(
        registry,
        overrides,
        'agents',
        canDelegateRecord.agentId,
        'agents'
      );
      continue;
    }
    if (typeof canDelegateRecord.externalAgentId === 'string') {
      assignComponentReferenceOverride(
        registry,
        overrides,
        'externalAgents',
        canDelegateRecord.externalAgentId,
        'externalAgents'
      );
    }
  }

  const canTransferTo = extractReferenceIds(subAgentData.canTransferTo);
  for (const transferTargetId of canTransferTo) {
    assignFirstMatchingComponentReferenceOverride(registry, overrides, transferTargetId, [
      ['subAgents', 'subAgents'],
      ['agents', 'agents'],
      ['externalAgents', 'externalAgents'],
    ]);
  }

  const dataComponentIds = extractReferenceIds(subAgentData.dataComponents);
  for (const dataComponentId of dataComponentIds) {
    assignComponentReferenceOverride(
      registry,
      overrides,
      'dataComponents',
      dataComponentId,
      'dataComponents'
    );
  }

  const artifactComponentIds = extractReferenceIds(subAgentData.artifactComponents);
  for (const artifactComponentId of artifactComponentIds) {
    assignComponentReferenceOverride(
      registry,
      overrides,
      'artifactComponents',
      artifactComponentId,
      'artifactComponents'
    );
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
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

function collectProjectReferenceOverrides(
  context: GenerationContext
): ProjectReferenceOverrides | undefined {
  const registry = context.existingComponentRegistry;
  if (!registry) {
    return;
  }

  const overrides: ProjectReferenceOverrides = {};

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

function assignComponentReferenceOverrideForProject(
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

function extractReferenceIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        const record = asRecord(item);
        if (record && typeof record.id === 'string') {
          return record.id;
        }
        return undefined;
      })
      .filter((id): id is string => !!id);
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.keys(record);
}

function resolveRecordFilePath(
  context: GenerationContext,
  componentType: ComponentType,
  componentId: string,
  fallbackFilePath: string
): string {
  const existingComponent = context.existingComponentRegistry?.get(componentId, componentType);
  if (!existingComponent?.filePath) {
    return fallbackFilePath;
  }

  return resolveProjectFilePath(context.paths.projectRoot, existingComponent.filePath);
}

function resolveProjectFilePath(projectRoot: string, filePath: string): string {
  if (filePath.startsWith('/')) {
    return filePath;
  }
  return join(projectRoot, filePath);
}

function normalizeFilePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function writeTypeScriptFile(
  filePath: string,
  content: string,
  writeMode: 'merge' | 'overwrite'
): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const processedContent =
    writeMode === 'merge' && existsSync(filePath)
      ? mergeSafely(readFileSync(filePath, 'utf8'), content)
      : content;

  const sourceFile = createInMemoryProject().createSourceFile('generated.ts', processedContent, {
    overwrite: true,
  });

  const normalizedSourceFile = moveVariableDeclarationsBeforeUsage(
    applyObjectShorthand(sourceFile)
  );
  sourceFile.formatText();
  writeFileSync(filePath, `${normalizedSourceFile.getFullText().trimEnd()}\n`);
}

function mergeSafely(existingContent: string, generatedContent: string): string {
  try {
    return mergeGeneratedModule(existingContent, generatedContent);
  } catch {
    return generatedContent;
  }
}

function applyObjectShorthand(sourceFile: SourceFile): SourceFile {
  for (const objectLiteral of sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const property of objectLiteral.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        continue;
      }
      const nameNode = property.getNameNode();
      const initializer = property.getInitializer();
      if (!Node.isIdentifier(nameNode) || !initializer || !Node.isIdentifier(initializer)) {
        continue;
      }
      if (nameNode.getText() !== initializer.getText()) {
        continue;
      }
      property.replaceWithText(nameNode.getText());
    }
  }
  return sourceFile;
}

function moveVariableDeclarationsBeforeUsage(sourceFile: SourceFile): SourceFile {
  let moved = true;
  while (moved) {
    moved = false;
    const variableStatements = sourceFile.getVariableStatements();
    for (const variableStatement of variableStatements) {
      const statementStart = variableStatement.getStart();
      const sourceStatements = sourceFile.getStatements();
      const statementIndex = sourceStatements.indexOf(variableStatement);
      if (statementIndex <= 0) {
        continue;
      }

      let targetIndex: number | undefined;
      for (const declaration of variableStatement.getDeclarations()) {
        for (const referenceNode of declaration.findReferencesAsNodes()) {
          if (referenceNode.getSourceFile() !== sourceFile) {
            continue;
          }

          const parentNode = referenceNode.getParent();
          if (parentNode === declaration) {
            continue;
          }

          if (referenceNode.getStart() >= statementStart) {
            continue;
          }

          if (isReferenceInsideFunctionLike(referenceNode)) {
            continue;
          }
          // @ts-expect-error -- fixme
          const topLevelStatement = referenceNode.getFirstAncestor((ancestor) => {
            return Node.isStatement(ancestor) && ancestor.getParentIfKind(SyntaxKind.SourceFile);
          });
          if (!topLevelStatement) {
            continue;
          }
          // @ts-expect-error -- fixme
          const topLevelStatementIndex = sourceStatements.indexOf(topLevelStatement);
          if (topLevelStatementIndex === -1 || topLevelStatementIndex >= statementIndex) {
            continue;
          }

          targetIndex =
            targetIndex === undefined
              ? topLevelStatementIndex
              : Math.min(targetIndex, topLevelStatementIndex);
        }
      }

      if (targetIndex === undefined) {
        continue;
      }

      const statementText = variableStatement.getText();
      variableStatement.remove();
      sourceFile.insertStatements(targetIndex, [statementText]);
      moved = true;
      break;
    }
  }
  return sourceFile;
}

function isReferenceInsideFunctionLike(referenceNode: Node): boolean {
  return Boolean(
    referenceNode.getFirstAncestor((ancestor) => {
      return (
        Node.isArrowFunction(ancestor) ||
        Node.isFunctionDeclaration(ancestor) ||
        Node.isFunctionExpression(ancestor) ||
        Node.isMethodDeclaration(ancestor) ||
        Node.isGetAccessorDeclaration(ancestor) ||
        Node.isSetAccessorDeclaration(ancestor)
      );
    })
  );
}
