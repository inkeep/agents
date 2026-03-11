import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { buildComponentRegistryFromParsing } from './component-parser';
import type { ComponentRegistry, ComponentType } from './component-registry';
import { generateAgentDefinition } from './generators/agent-generator';
import { generateArtifactComponentDefinition } from './generators/artifact-component-generator';
import { generateContextConfigDefinition } from './generators/context-config-generator';
import { generateCredentialDefinition } from './generators/credential-generator';
import { generateDataComponentDefinition } from './generators/data-component-generator';
import {
  generateEnvironmentIndexDefinition,
  generateEnvironmentSettingsDefinition,
} from './generators/environment-generator';
import { generateExternalAgentDefinition } from './generators/external-agent-generator';
import { generateFunctionToolDefinition } from './generators/function-tool-generator';
import { generateMcpToolDefinition } from './generators/mcp-tool-generator';
import { generateProjectDefinition } from './generators/project-generator';
import { generateStatusComponentDefinition } from './generators/status-component-generator';
import { generateSubAgentDefinition } from './generators/sub-agent-generator';
import { resolveSubAgentVariableName } from './generators/sub-agent-generator.helpers';
import { generateTriggerDefinition } from './generators/trigger-generator';
import { mergeGeneratedModule } from './module-merge';
import { generateScheduledTriggerDefinition } from './scheduled-trigger-generator';
import {
  buildComponentFileName,
  collectTemplateVariableNames,
  createInMemoryProject,
  isHumanReadableId,
  isPlainObject,
  toCamelCase,
  toCredentialReferenceName,
  toKebabCase,
  toToolReferenceName,
} from './utils';

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

type SubAgentReferencePathOverrides = Partial<
  Record<'tools' | 'subAgents' | 'agents' | 'externalAgents', Record<string, string>>
>;

interface SubAgentDependencyReferences {
  referenceOverrides?: SubAgentReferenceOverrides;
  referencePathOverrides?: SubAgentReferencePathOverrides;
}

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

type ProjectReferencePathOverrides = Partial<
  Record<ProjectReferenceOverrideType, Record<string, string>>
>;

interface TemplateReferenceOverride {
  name: string;
  local?: boolean;
}

interface ContextTemplateReferences {
  contextConfigId: string;
  contextConfigReference: TemplateReferenceOverride;
  contextConfigHeadersReference?: TemplateReferenceOverride;
}

export async function introspectGenerate({
  project,
  paths,
  writeMode = 'merge',
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
  const generatedFiles: string[] = [];

  for (const task of tasks) {
    const records = task.collect(context);
    for (const record of records) {
      const sourceFile = task.generate(record.payload);
      writeTypeScriptFile(record.filePath, sourceFile.getFullText(), writeMode);
      generatedFiles.push(record.filePath);
    }
  }

  if (debug) {
    console.log(`Generated ${generatedFiles.length} files`);
    if (skippedAgents.length) {
      console.log(
        `Skipped ${skippedAgents.length} agent(s): ${skippedAgents
          .map((agent) => `${agent.id} (${agent.reason})`)
          .join(', ')}`
      );
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
      type: 'environment-settings',
      collect: collectEnvironmentSettingsRecords,
      generate: generateEnvironmentSettingsRecord,
    },
    {
      type: 'environment-index',
      collect: collectEnvironmentIndexRecords,
      generate: generateEnvironmentIndexDefinition,
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
      type: 'function-tool',
      collect: collectFunctionToolRecords,
      generate: generateFunctionToolDefinition,
    },
    {
      type: 'tool',
      collect: collectToolRecords,
      generate: generateMcpToolDefinition,
    },
    {
      type: 'external-agent',
      collect: collectExternalAgentRecords,
      generate: generateExternalAgentDefinition,
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
      type: 'scheduled-trigger',
      collect: collectScheduledTriggerRecords,
      generate: generateScheduledTriggerDefinition,
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

  const credentialEntries = Object.entries(context.project.credentialReferences);
  const fileNamesByCredentialId = buildSequentialNameFileNames(credentialEntries);

  return credentialEntries.map(([credentialId, credentialData]) => ({
    id: credentialId,
    filePath: resolveRecordFilePath(
      context,
      'credentials',
      credentialId,
      join(context.paths.credentialsDir, fileNamesByCredentialId[credentialId])
    ),
    payload: {
      credentialId,
      ...credentialData,
    } as Parameters<typeof generateCredentialDefinition>[0],
  }));
}

function collectEnvironmentSettingsRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateEnvironmentSettingsDefinition>[1]>> {
  const credentialReferenceIds = collectEnvironmentCredentialReferenceIds(context.project);
  if (credentialReferenceIds.length === 0) {
    return [];
  }

  const credentialsById: Record<string, unknown> = {};
  for (const credentialReferenceId of credentialReferenceIds) {
    const credentialData = context.project.credentialReferences?.[credentialReferenceId];
    if (isPlainObject(credentialData)) {
      credentialsById[credentialReferenceId] = {
        ...credentialData,
        id: credentialReferenceId,
      };
      continue;
    }

    credentialsById[credentialReferenceId] = {
      id: credentialReferenceId,
    };
  }

  return [
    {
      id: 'development',
      filePath: resolveRecordFilePath(
        context,
        'environments',
        'development',
        join(context.paths.environmentsDir, 'development.env.ts')
      ),
      payload: {
        credentials: credentialsById,
      } as Parameters<typeof generateEnvironmentSettingsDefinition>[1],
    },
  ];
}

function collectEnvironmentIndexRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateEnvironmentIndexDefinition>[0]>> {
  const credentialReferenceIds = collectEnvironmentCredentialReferenceIds(context.project);
  if (credentialReferenceIds.length === 0) {
    return [];
  }

  return [
    {
      id: 'index',
      filePath: resolveRecordFilePath(
        context,
        'environments',
        'index',
        join(context.paths.environmentsDir, 'index.ts')
      ),
      payload: ['development'] as Parameters<typeof generateEnvironmentIndexDefinition>[0],
    },
  ];
}

function generateEnvironmentSettingsRecord(
  payload: Parameters<typeof generateEnvironmentSettingsDefinition>[1]
): SourceFile {
  return generateEnvironmentSettingsDefinition('development', payload);
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
        join(
          context.paths.artifactComponentsDir,
          buildComponentFileName(artifactComponentId, artifactComponentData.name ?? undefined)
        )
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
  const recordsByDataComponentId = new Map<
    string,
    GenerationRecord<Parameters<typeof generateDataComponentDefinition>[0]>
  >();

  for (const [dataComponentId, dataComponent] of Object.entries(
    context.project.dataComponents ?? {}
  )) {
    recordsByDataComponentId.set(dataComponentId, {
      id: dataComponentId,
      filePath: resolveRecordFilePath(
        context,
        'dataComponents',
        dataComponentId,
        join(
          context.paths.dataComponentsDir,
          buildComponentFileName(dataComponentId, dataComponent.name ?? undefined)
        )
      ),
      payload: {
        dataComponentId,
        ...dataComponent,
      } as Parameters<typeof generateDataComponentDefinition>[0],
    });
  }

  for (const dataComponentId of collectReferencedSubAgentComponentIds(context, 'dataComponents')) {
    if (recordsByDataComponentId.has(dataComponentId)) {
      continue;
    }

    recordsByDataComponentId.set(dataComponentId, {
      id: dataComponentId,
      filePath: resolveRecordFilePath(
        context,
        'dataComponents',
        dataComponentId,
        join(context.paths.dataComponentsDir, `${dataComponentId}.ts`)
      ),
      payload: {
        dataComponentId,
        name: dataComponentId,
        props: { type: 'object', properties: {} },
      } as Parameters<typeof generateDataComponentDefinition>[0],
    });
  }

  return [...recordsByDataComponentId.values()];
}

function collectReferencedSubAgentComponentIds(
  context: GenerationContext,
  componentProperty: 'dataComponents' | 'artifactComponents'
): string[] {
  const componentIds = new Set<string>();

  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents?.[agentId];
    const subAgents = asRecord(agentData?.subAgents);
    if (!subAgents) {
      continue;
    }

    for (const subAgentData of Object.values(subAgents)) {
      const subAgentRecord = asRecord(subAgentData);
      if (!subAgentRecord) {
        continue;
      }

      for (const componentId of extractReferenceIds(subAgentRecord[componentProperty])) {
        componentIds.add(componentId);
      }
    }
  }

  return [...componentIds];
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

    const normalizedContextConfig = applyPromptHeaderTemplateSchema(
      contextConfig,
      collectHeaderTemplateVariablesFromAgentPrompts(agentData)
    );

    const contextConfigId =
      typeof normalizedContextConfig.id === 'string' ? normalizedContextConfig.id : '';
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
        normalizedContextConfig
      );
      const credentialReferencePathOverrides = collectContextConfigCredentialReferencePathOverrides(
        context,
        normalizedContextConfig
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
          ...normalizedContextConfig,
          ...(headersReferenceOverride && {
            headersReference: headersReferenceOverride,
          }),
          ...(credentialReferenceOverrides && {
            referenceOverrides: {
              credentialReferences: credentialReferenceOverrides,
            },
          }),
          ...(credentialReferencePathOverrides && {
            referencePathOverrides: {
              credentialReferences: credentialReferencePathOverrides,
            },
          }),
        } as Parameters<typeof generateContextConfigDefinition>[0],
      });
    }
  }

  return [...contextConfigRecordsById.values()];
}

interface FunctionToolEntry {
  functionToolId: string;
  functionId: string;
  functionToolData: Record<string, unknown>;
  functionData: Record<string, unknown>;
  exportName: string;
  fileName: string;
}

function collectFunctionToolRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateFunctionToolDefinition>[0]>> {
  const functionToolEntries = collectFunctionToolEntries(context.project);
  if (!functionToolEntries.length) {
    return [];
  }

  const fileNamesByFunctionToolId = buildSequentialNameFileNames(
    functionToolEntries.map(({ functionToolId, fileName }) => [functionToolId, { name: fileName }])
  );

  return functionToolEntries.map(
    ({
      functionToolId,
      functionToolData,
      functionData,
    }): GenerationRecord<Parameters<typeof generateFunctionToolDefinition>[0]> => {
      const modulePath = stripExtension(fileNamesByFunctionToolId[functionToolId]);
      const functionToolName =
        typeof functionToolData.name === 'string' && functionToolData.name.length > 0
          ? functionToolData.name
          : typeof functionData.name === 'string' && functionData.name.length > 0
            ? functionData.name
            : undefined;
      const functionToolDescription =
        typeof functionToolData.description === 'string'
          ? functionToolData.description
          : typeof functionData.description === 'string'
            ? functionData.description
            : undefined;

      return {
        id: functionToolId,
        filePath: resolveRecordFilePath(
          context,
          'functionTools',
          functionToolId,
          join(context.paths.toolsDir, `${modulePath}.ts`)
        ),
        payload: {
          functionToolId,
          ...(functionToolName && { name: functionToolName }),
          ...(functionToolDescription !== undefined && {
            description: functionToolDescription,
          }),
          ...(functionData.inputSchema !== undefined && { inputSchema: functionData.inputSchema }),
          ...(functionData.schema !== undefined && { schema: functionData.schema }),
          ...(functionData.executeCode !== undefined && { executeCode: functionData.executeCode }),
          ...(functionData.dependencies !== undefined && {
            dependencies: functionData.dependencies,
          }),
        } as Parameters<typeof generateFunctionToolDefinition>[0],
      };
    }
  );
}

function collectFunctionToolEntries(project: FullProjectDefinition): FunctionToolEntry[] {
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

function collectToolRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateMcpToolDefinition>[0]>> {
  const toolEntries = Object.entries(context.project.tools ?? {});
  const fileNamesByToolId = buildSequentialNameFileNames(toolEntries);

  return toolEntries.map(([toolId, toolData]) => ({
    id: toolId,
    filePath: resolveRecordFilePath(
      context,
      'tools',
      toolId,
      join(context.paths.toolsDir, fileNamesByToolId[toolId])
    ),
    payload: {
      mcpToolId: toolId,
      ...toolData,
    } as Parameters<typeof generateMcpToolDefinition>[0],
  }));
}

function collectExternalAgentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateExternalAgentDefinition>[0]>> {
  const externalAgentEntries = Object.entries(context.project.externalAgents ?? {});
  const fileNamesByExternalAgentId = buildSequentialNameFileNames(
    externalAgentEntries.map(([externalAgentId, externalAgentData]) => [
      externalAgentId,
      { name: resolveExternalAgentNamingSeed(externalAgentId, externalAgentData) },
    ])
  );
  const referenceNamesByExternalAgentId = buildExternalAgentReferenceNamesById(context.project);

  return externalAgentEntries.map(([externalAgentId, externalAgentData]) => {
    const externalAgentRecord = asRecord(externalAgentData) ?? {};
    return {
      id: externalAgentId,
      filePath: resolveRecordFilePath(
        context,
        'externalAgents',
        externalAgentId,
        join(context.paths.externalAgentsDir, fileNamesByExternalAgentId[externalAgentId])
      ),
      payload: {
        externalAgentId,
        externalAgentReferenceName: referenceNamesByExternalAgentId[externalAgentId],
        ...externalAgentRecord,
      } as Parameters<typeof generateExternalAgentDefinition>[0],
    };
  });
}

function collectContextConfigCredentialReferenceOverrides(
  context: GenerationContext,
  contextConfigData: Record<string, unknown>
): Record<string, string> | undefined {
  const contextVariables = asRecord(contextConfigData.contextVariables);
  if (!contextVariables) {
    return;
  }

  const credentialReferenceNamesById = buildCredentialReferenceNamesById(context.project);
  const registry = context.existingComponentRegistry;
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

    const credentialReferenceName = credentialReferenceNamesById[credentialReferenceId];
    if (credentialReferenceName) {
      overrides[credentialReferenceId] = credentialReferenceName;
    }

    const existingCredential = registry?.get(credentialReferenceId, 'credentials');
    if (existingCredential?.name) {
      overrides[credentialReferenceId] = existingCredential.name;
    }
  }

  return Object.keys(overrides).length ? overrides : undefined;
}

function collectContextConfigCredentialReferencePathOverrides(
  context: GenerationContext,
  contextConfigData: Record<string, unknown>
): Record<string, string> | undefined {
  const contextVariables = asRecord(contextConfigData.contextVariables);
  if (!contextVariables) {
    return;
  }

  const credentialReferencePathById = buildCredentialReferencePathById(context.project);
  const registry = context.existingComponentRegistry;
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

    const credentialReferencePath = credentialReferencePathById[credentialReferenceId];
    if (credentialReferencePath) {
      overrides[credentialReferenceId] = credentialReferencePath;
    }

    const existingCredential = registry?.get(credentialReferenceId, 'credentials');
    if (existingCredential?.filePath) {
      overrides[credentialReferenceId] = stripExtension(basename(existingCredential.filePath));
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

  const credentialReferenceNamesById = buildCredentialReferenceNamesById(context.project);
  const credentialReferencePathsById = buildCredentialReferencePathById(context.project);
  const records: Array<GenerationRecord<Parameters<typeof generateTriggerDefinition>[0]>> = [];
  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    if (!agentData?.triggers) {
      continue;
    }

    const triggerEntries = Object.entries(agentData.triggers);
    const fileNamesByTriggerId = buildSequentialNameFileNames(triggerEntries);

    for (const [triggerId, triggerData] of triggerEntries) {
      const triggerRecord = asRecord(triggerData);
      const signingSecretCredentialReferenceId =
        typeof triggerRecord?.signingSecretCredentialReferenceId === 'string'
          ? triggerRecord.signingSecretCredentialReferenceId
          : undefined;
      let signingSecretCredentialReferenceName = signingSecretCredentialReferenceId
        ? credentialReferenceNamesById[signingSecretCredentialReferenceId]
        : undefined;
      let signingSecretCredentialReferencePath = signingSecretCredentialReferenceId
        ? credentialReferencePathsById[signingSecretCredentialReferenceId]
        : undefined;

      if (signingSecretCredentialReferenceId && context.existingComponentRegistry) {
        const existingCredential = context.existingComponentRegistry.get(
          signingSecretCredentialReferenceId,
          'credentials'
        );
        if (existingCredential?.name) {
          signingSecretCredentialReferenceName = existingCredential.name;
        }
        if (existingCredential?.filePath) {
          signingSecretCredentialReferencePath = stripExtension(
            basename(existingCredential.filePath)
          );
        }
      }

      records.push({
        id: triggerId,
        filePath: resolveRecordFilePath(
          context,
          'triggers',
          triggerId,
          join(context.paths.agentsDir, 'triggers', fileNamesByTriggerId[triggerId])
        ),
        payload: {
          triggerId,
          ...triggerData,
          ...(signingSecretCredentialReferenceName && {
            signingSecretCredentialReferenceName,
          }),
          ...(signingSecretCredentialReferencePath && {
            signingSecretCredentialReferencePath,
          }),
        } as Parameters<typeof generateTriggerDefinition>[0],
      });
    }
  }

  return records;
}

function collectScheduledTriggerRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateScheduledTriggerDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const records: Array<GenerationRecord<Parameters<typeof generateScheduledTriggerDefinition>[0]>> =
    [];
  for (const agentId of context.completeAgentIds) {
    const agentData = context.project.agents[agentId];
    if (!agentData?.scheduledTriggers) {
      continue;
    }

    const scheduledTriggerEntries = Object.entries(agentData.scheduledTriggers);
    const fileNamesByScheduledTriggerId = buildSequentialNameFileNames(scheduledTriggerEntries);

    for (const [scheduledTriggerId, scheduledTriggerData] of Object.entries(
      agentData.scheduledTriggers
    )) {
      records.push({
        id: scheduledTriggerId,
        filePath: resolveRecordFilePath(
          context,
          'scheduledTriggers',
          scheduledTriggerId,
          join(
            context.paths.agentsDir,
            'scheduled-triggers',
            fileNamesByScheduledTriggerId[scheduledTriggerId]
          )
        ),
        payload: {
          scheduledTriggerId,
          ...scheduledTriggerData,
        } as Parameters<typeof generateScheduledTriggerDefinition>[0],
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

    const agentName = typeof agentData.name === 'string' ? agentData.name : undefined;
    const agentFilePath = resolveRecordFilePath(
      context,
      'agents',
      agentId,
      join(context.paths.agentsDir, buildComponentFileName(agentId, agentName))
    );
    const existingAgent = context.existingComponentRegistry?.get(agentId, 'agents');
    const subAgentReferences = collectSubAgentReferenceOverrides(context, agentData, agentFilePath);
    const subAgentReferencePathOverrides = collectSubAgentReferencePathOverrides(
      context,
      agentData
    );
    const statusUpdates = asRecord(agentData.statusUpdates);
    const contextTemplateReferences = collectContextTemplateReferences(
      context,
      agentData,
      agentFilePath,
      [
        typeof agentData.prompt === 'string' ? agentData.prompt : undefined,
        typeof statusUpdates?.prompt === 'string' ? statusUpdates.prompt : undefined,
      ]
    );

    records.push({
      id: agentId,
      filePath: agentFilePath,
      payload: {
        agentId,
        ...agentData,
        ...(existingAgent?.name?.length && { agentVariableName: existingAgent.name }),
        ...(Object.keys(subAgentReferences).length && { subAgentReferences }),
        ...(Object.keys(subAgentReferencePathOverrides).length && {
          subAgentReferencePathOverrides,
        }),
        ...(contextTemplateReferences && {
          contextConfigReference: contextTemplateReferences.contextConfigReference,
        }),
        ...(contextTemplateReferences?.contextConfigHeadersReference && {
          contextConfigHeadersReference: contextTemplateReferences.contextConfigHeadersReference,
        }),
      } as Parameters<typeof generateAgentDefinition>[0],
    });
  }
  return records;
}

function collectSubAgentReferencePathOverrides(
  context: GenerationContext,
  agentData: Record<string, unknown>
): Record<string, string> {
  const generatedSubAgentReferencePathById = buildSubAgentReferencePathById(
    context.project,
    context.completeAgentIds
  );
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
    const fallbackReferencePath = generatedSubAgentReferencePathById[subAgentId];
    const subAgentData = asRecord(subAgents?.[subAgentId]);
    const subAgentName = typeof subAgentData?.name === 'string' ? subAgentData.name : undefined;
    const subAgentFilePath = resolveRecordFilePath(
      context,
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

function collectSubAgentRecords(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateSubAgentDefinition>[0]>> {
  if (!context.project.agents) {
    return [];
  }

  const recordsBySubAgentId = new Map<
    string,
    GenerationRecord<Parameters<typeof generateSubAgentDefinition>[0]>
  >();
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

      const dependencyReferences = collectSubAgentDependencyReferenceOverrides(context, payload);
      const subAgentName = typeof payload.name === 'string' ? payload.name : undefined;
      const subAgentFilePath = resolveRecordFilePath(
        context,
        'subAgents',
        subAgentId,
        join(
          context.paths.agentsDir,
          'sub-agents',
          buildComponentFileName(subAgentId, subAgentName)
        )
      );
      const contextTemplateReferences = collectContextTemplateReferences(
        context,
        agentData,
        subAgentFilePath,
        [typeof payload.prompt === 'string' ? payload.prompt : undefined]
      );

      recordsBySubAgentId.set(subAgentId, {
        id: subAgentId,
        filePath: subAgentFilePath, // @ts-expect-error -- fixme
        payload: {
          subAgentId,
          ...payload,
          ...(dependencyReferences?.referenceOverrides && {
            referenceOverrides: dependencyReferences.referenceOverrides,
          }),
          ...(dependencyReferences?.referencePathOverrides && {
            referencePathOverrides: dependencyReferences.referencePathOverrides,
          }),
          ...(contextTemplateReferences && {
            contextConfigId: contextTemplateReferences.contextConfigId,
            contextConfigReference: contextTemplateReferences.contextConfigReference,
          }),
          ...(contextTemplateReferences?.contextConfigHeadersReference && {
            contextConfigHeadersReference: contextTemplateReferences.contextConfigHeadersReference,
          }),
        } as Parameters<typeof generateSubAgentDefinition>[0],
      });
    }
  }

  return [...recordsBySubAgentId.values()];
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

      const statusComponentName = typeof payload.name === 'string' ? payload.name : undefined;
      statusComponentRecordsById.set(statusComponentId, {
        id: statusComponentId,
        filePath: resolveRecordFilePath(
          context,
          'statusComponents',
          statusComponentId,
          join(
            context.paths.statusComponentsDir,
            buildComponentFileName(statusComponentId, statusComponentName)
          )
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
  const referencePathOverrides = collectProjectReferencePathOverrides(context);

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
        ...(referencePathOverrides && { referencePathOverrides }),
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

function collectEnvironmentCredentialReferenceIds(project: FullProjectDefinition): string[] {
  const credentialReferenceIds = new Set<string>();

  for (const toolData of Object.values(project.tools ?? {})) {
    const toolRecord = asRecord(toolData);
    const credentialReferenceId =
      toolRecord && typeof toolRecord.credentialReferenceId === 'string'
        ? toolRecord.credentialReferenceId
        : undefined;
    const hasInlineCredential =
      toolRecord?.credential !== undefined && toolRecord?.credential !== null;

    if (credentialReferenceId && !hasInlineCredential) {
      credentialReferenceIds.add(credentialReferenceId);
    }
  }

  return [...credentialReferenceIds];
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
  const generatedSubAgentReferenceNamesById = buildSubAgentReferenceNamesById(
    context.project,
    context.completeAgentIds
  );
  const subAgentIds = new Set<string>(extractReferenceIds(agentData.subAgents));
  if (typeof agentData.defaultSubAgentId === 'string' && agentData.defaultSubAgentId.length > 0) {
    subAgentIds.add(agentData.defaultSubAgentId);
  }

  if (!subAgentIds.size) {
    return {};
  }

  const subAgents = asRecord(agentData.subAgents);
  const overrides: Record<string, { name: string; local?: boolean }> = {};
  for (const subAgentId of subAgentIds) {
    const subAgentData = asRecord(subAgents?.[subAgentId]);
    const subAgentName = typeof subAgentData?.name === 'string' ? subAgentData.name : undefined;
    overrides[subAgentId] = {
      name:
        generatedSubAgentReferenceNamesById[subAgentId] ??
        resolveSubAgentVariableName(subAgentId, subAgentName),
    };

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
  const contextConfig = extractContextConfigData(agentData);
  const contextConfigId = contextConfig?.id;
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

function collectContextTemplateReferences(
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

  const contextConfigFilePath = resolveRecordFilePath(
    context,
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

function extractContextConfigData(
  agentData: Record<string, unknown>
): { id: string; value: Record<string, unknown> } | undefined {
  const contextConfig =
    typeof agentData.contextConfig === 'string'
      ? { id: agentData.contextConfig }
      : asRecord(agentData.contextConfig);
  const contextConfigId =
    contextConfig && typeof contextConfig.id === 'string' ? contextConfig.id : undefined;
  if (!contextConfigId || !contextConfig) {
    return;
  }

  return {
    id: contextConfigId,
    value: contextConfig,
  };
}

function inferHeadersReferenceFromContextConfig(
  contextConfig: { id: string; value: Record<string, unknown> },
  contextConfigId: string
): string | undefined {
  const headers = contextConfig.value.headers;
  if (typeof headers === 'string' && headers.length > 0) {
    return toCamelCase(headers);
  }

  const headersRecord = asRecord(headers);
  if (headersRecord) {
    if (typeof headersRecord.id === 'string' && headersRecord.id) {
      return toCamelCase(headersRecord.id);
    }
    if (typeof headersRecord.name === 'string' && headersRecord.name) {
      return toCamelCase(headersRecord.name);
    }
  }

  if (isPlainObject(contextConfig.value.headersSchema)) {
    return `${toCamelCase(contextConfigId)}Headers`;
  }

  return;
}

function collectTemplateVariablesFromValues(values: Array<string | undefined>): string[] {
  const variables: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    variables.push(...collectTemplateVariableNames(value));
  }
  return variables;
}

function collectHeaderTemplateVariablesFromAgentPrompts(
  agentData: Record<string, unknown>
): Set<string> {
  const variables = new Set<string>();
  addHeaderTemplateVariablesFromString(
    typeof agentData.prompt === 'string' ? agentData.prompt : undefined,
    variables
  );

  const statusUpdates = asRecord(agentData.statusUpdates);
  addHeaderTemplateVariablesFromString(
    typeof statusUpdates?.prompt === 'string' ? statusUpdates.prompt : undefined,
    variables
  );

  const subAgents = asRecord(agentData.subAgents);
  if (!subAgents) {
    return variables;
  }

  for (const subAgentData of Object.values(subAgents)) {
    const subAgent = asRecord(subAgentData);
    addHeaderTemplateVariablesFromString(
      typeof subAgent?.prompt === 'string' ? subAgent.prompt : undefined,
      variables
    );
  }

  return variables;
}

function addHeaderTemplateVariablesFromString(
  value: string | undefined,
  variables: Set<string>
): void {
  if (typeof value !== 'string') {
    return;
  }

  for (const variableName of collectTemplateVariableNames(value)) {
    if (!variableName.startsWith('headers.')) {
      continue;
    }
    const headerPath = variableName.slice('headers.'.length);
    if (headerPath) {
      variables.add(headerPath);
    }
  }
}

function applyPromptHeaderTemplateSchema(
  contextConfig: Record<string, unknown>,
  headerTemplateVariables: Set<string>
): Record<string, unknown> {
  if (!headerTemplateVariables.size) {
    return contextConfig;
  }

  const hasExplicitHeadersReference =
    typeof contextConfig.headers === 'string' || isPlainObject(contextConfig.headers);
  if (hasExplicitHeadersReference || isPlainObject(contextConfig.headersSchema)) {
    return contextConfig;
  }

  const variableNames = [...headerTemplateVariables].sort();
  const properties = Object.fromEntries(
    variableNames.map((variableName) => [variableName, { type: 'string' }])
  );

  return {
    ...contextConfig,
    headersSchema: {
      type: 'object',
      properties,
      required: variableNames,
      additionalProperties: false,
    },
  };
}

function collectSubAgentDependencyReferenceOverrides(
  context: GenerationContext,
  subAgentData: Record<string, unknown>
): SubAgentDependencyReferences | undefined {
  const registry = context.existingComponentRegistry;
  const referenceOverrides: SubAgentReferenceOverrides = {};
  const referencePathOverrides: SubAgentReferencePathOverrides = {};
  const toolReferenceNamesById = buildToolReferenceNamesById(context.project);
  const toolReferencePathsById = buildToolReferencePathById(context.project);
  const subAgentReferenceNamesById = buildSubAgentReferenceNamesById(
    context.project,
    context.completeAgentIds
  );
  const subAgentReferencePathsById = buildSubAgentReferencePathById(
    context.project,
    context.completeAgentIds
  );
  const agentReferenceNamesById = buildAgentReferenceNamesById(context.project);
  const agentReferencePathsById = buildAgentReferencePathById(context.project);
  const externalAgentReferenceNamesById = buildExternalAgentReferenceNamesById(context.project);
  const externalAgentReferencePathsById = buildExternalAgentReferencePathById(context.project);

  const assignSubAgentReferenceOverrides = (subAgentId: string): void => {
    const subAgentReferenceName = subAgentReferenceNamesById[subAgentId];
    if (subAgentReferenceName) {
      assignReferenceOverride(referenceOverrides, 'subAgents', subAgentId, subAgentReferenceName);
    }

    const subAgentReferencePath = subAgentReferencePathsById[subAgentId];
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
    const agentReferenceName = agentReferenceNamesById[agentId];
    if (agentReferenceName) {
      assignReferenceOverride(referenceOverrides, 'agents', agentId, agentReferenceName);
    }

    const agentReferencePath = agentReferencePathsById[agentId];
    if (agentReferencePath) {
      assignReferencePathOverride(referencePathOverrides, 'agents', agentId, agentReferencePath);
    }
  };

  const assignExternalAgentReferenceOverrides = (externalAgentId: string): void => {
    const externalAgentReferenceName = externalAgentReferenceNamesById[externalAgentId];
    if (externalAgentReferenceName) {
      assignReferenceOverride(
        referenceOverrides,
        'externalAgents',
        externalAgentId,
        externalAgentReferenceName
      );
    }

    const externalAgentReferencePath = externalAgentReferencePathsById[externalAgentId];
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

    assignReferenceOverride(
      referenceOverrides,
      'tools',
      toolId,
      toolReferenceNamesById[toolId] ?? toToolReferenceName(toolId)
    );
    assignReferencePathOverride(
      referencePathOverrides,
      'tools',
      toolId,
      toolReferencePathsById[toolId] ?? toKebabCase(toolId)
    );

    if (registry) {
      assignComponentReferenceOverride(registry, referenceOverrides, 'tools', toolId, 'tools');
      assignComponentReferenceOverride(
        registry,
        referenceOverrides,
        'tools',
        toolId,
        'functionTools'
      );
      const toolComponent = registry.get(toolId, 'functionTools') ?? registry.get(toolId, 'tools');
      if (toolComponent?.filePath) {
        assignReferencePathOverride(
          referencePathOverrides,
          'tools',
          toolId,
          resolveToolModulePath(toolComponent.filePath)
        );
      }
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

function collectProjectReferenceOverrides(
  context: GenerationContext
): ProjectReferenceOverrides | undefined {
  const overrides: ProjectReferenceOverrides = {};
  addProjectNameBasedReferenceOverrides(context.project, overrides);

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

function addProjectNameBasedReferenceOverrides(
  project: FullProjectDefinition,
  overrides: ProjectReferenceOverrides
): void {
  for (const [toolId, toolData] of Object.entries(project.tools ?? {})) {
    const toolName = asRecord(toolData)?.name;
    const referenceName =
      typeof toolName === 'string' && toolName.length > 0
        ? toToolReferenceName(toolName)
        : toToolReferenceName(toolId);
    assignProjectReferenceOverride(overrides, 'tools', toolId, referenceName);
  }

  for (const [credentialId, credentialData] of Object.entries(project.credentialReferences ?? {})) {
    const credentialName = asRecord(credentialData)?.name;
    const referenceName =
      typeof credentialName === 'string' && credentialName.length > 0
        ? toCredentialReferenceName(credentialName)
        : toCredentialReferenceName(credentialId);
    assignProjectReferenceOverride(overrides, 'credentialReferences', credentialId, referenceName);
  }

  const externalAgentReferenceNamesById = buildExternalAgentReferenceNamesById(project);
  for (const [externalAgentId, referenceName] of Object.entries(externalAgentReferenceNamesById)) {
    assignProjectReferenceOverride(overrides, 'externalAgents', externalAgentId, referenceName);
  }
}

function collectProjectReferencePathOverrides(
  context: GenerationContext
): ProjectReferencePathOverrides | undefined {
  const overrides: ProjectReferencePathOverrides = {};

  if (context.project.agents) {
    for (const agentId of context.completeAgentIds) {
      const agentData = asRecord(context.project.agents[agentId]);
      const agentName = typeof agentData?.name === 'string' ? agentData.name : undefined;
      assignProjectReferenceOverride(
        overrides,
        'agents',
        agentId,
        stripExtension(buildComponentFileName(agentId, agentName))
      );
    }
  }

  const toolEntries = Object.entries(context.project.tools ?? {});
  const toolFileNamesById = buildSequentialNameFileNames(toolEntries);
  for (const [toolId] of toolEntries) {
    assignProjectReferenceOverride(
      overrides,
      'tools',
      toolId,
      stripExtension(toolFileNamesById[toolId])
    );
  }

  const credentialEntries = Object.entries(context.project.credentialReferences ?? {});
  const credentialFileNamesById = buildSequentialNameFileNames(credentialEntries);
  for (const [credentialId] of credentialEntries) {
    assignProjectReferenceOverride(
      overrides,
      'credentialReferences',
      credentialId,
      stripExtension(credentialFileNamesById[credentialId])
    );
  }

  const externalAgentReferencePathsById = buildExternalAgentReferencePathById(context.project);
  for (const [externalAgentId, referencePath] of Object.entries(externalAgentReferencePathsById)) {
    assignProjectReferenceOverride(overrides, 'externalAgents', externalAgentId, referencePath);
  }

  const registry = context.existingComponentRegistry;
  if (registry) {
    for (const agentId of context.completeAgentIds) {
      const agentComponent = registry.get(agentId, 'agents');
      if (agentComponent?.filePath) {
        assignProjectReferenceOverride(
          overrides,
          'agents',
          agentId,
          stripExtension(basename(agentComponent.filePath))
        );
      }
    }

    for (const toolId of getObjectKeys(context.project.tools)) {
      const toolComponent = registry.get(toolId, 'functionTools') ?? registry.get(toolId, 'tools');
      if (toolComponent?.filePath) {
        assignProjectReferenceOverride(
          overrides,
          'tools',
          toolId,
          resolveToolModulePath(toolComponent.filePath)
        );
      }
    }

    for (const credentialId of getObjectKeys(context.project.credentialReferences)) {
      const credentialComponent = registry.get(credentialId, 'credentials');
      if (credentialComponent?.filePath) {
        assignProjectReferenceOverride(
          overrides,
          'credentialReferences',
          credentialId,
          stripExtension(basename(credentialComponent.filePath))
        );
      }
    }

    for (const externalAgentId of getObjectKeys(context.project.externalAgents)) {
      const externalAgentComponent = registry.get(externalAgentId, 'externalAgents');
      if (externalAgentComponent?.filePath) {
        assignProjectReferenceOverride(
          overrides,
          'externalAgents',
          externalAgentId,
          stripExtension(basename(externalAgentComponent.filePath))
        );
      }
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
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

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function resolveToolModulePath(filePath: string): string {
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

function resolveExternalAgentNamingSeed(
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

function toExternalAgentReferenceName(input: string): string {
  const base = toCamelCase(input);
  return base.endsWith('Agent') ? base : `${base}Agent`;
}

function buildSequentialNameFileNames(entries: Array<[string, unknown]>): Record<string, string> {
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
  } catch (error) {
    console.warn(
      `Warning: Failed to merge file, using generated content. Manual changes may be lost. Reason: ${error instanceof Error ? error.message : String(error)}`
    );
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
