import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { generateAgentDefinition } from './agent-generator';
import { generateArtifactComponentDefinition } from './artifact-component-generator';
import { generateContextConfigDefinition } from './context-config-generator';
import { generateCredentialDefinition } from './credential-generator';
import { mergeGeneratedModule } from './module-merge';
import { generateProjectDefinition } from './project-generator';
import { generateTriggerDefinition } from './trigger-generator';

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
  /** @default "merge" */
  writeMode?: 'merge' | 'overwrite';
  /** @default false */
  failOnUnsupportedComponents?: boolean;
}

interface GenerationContext {
  project: FullProjectDefinition;
  paths: ProjectPaths;
  completeAgentIds: Set<string>;
}

interface GenerationRecord<TPayload> {
  id: string;
  filePath: string;
  payload: TPayload;
}

interface GenerationTask<TPayload> {
  type: string;
  collect: (context: GenerationContext) => GenerationRecord<TPayload>[];
  generate: (payload: TPayload) => string;
}

interface SkippedAgent {
  id: string;
  reason: string;
}

interface UnsupportedComponentCounts {
  tools: number;
  functionTools: number;
  functions: number;
  dataComponents: number;
  externalAgents: number;
  statusComponents: number;
}

export async function introspectGenerate(
  project: FullProjectDefinition,
  paths: ProjectPaths,
  _environment: string,
  debug: boolean,
  { writeMode = 'merge', failOnUnsupportedComponents = false }: IntrospectOptions = {}
): Promise<void> {
  validateProject(project);

  const skippedAgents: SkippedAgent[] = [];
  const completeAgentIds = collectCompleteAgentIds(project, skippedAgents);
  const context: GenerationContext = { project, paths, completeAgentIds };
  const tasks = createGenerationTasks();
  const failures: string[] = [];
  const generatedFiles: string[] = [];

  for (const task of tasks) {
    const records = task.collect(context);
    for (const record of records) {
      try {
        const content = task.generate(record.payload);
        writeTypeScriptFile(record.filePath, content, writeMode);
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
    throw new Error(`Introspect v4 generation failed:\n${failures.join('\n')}`);
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
      filePath: join(context.paths.credentialsDir, `${credentialId}.ts`),
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
      filePath: join(context.paths.artifactComponentsDir, `${artifactComponentId}.ts`),
      payload: {
        artifactComponentId,
        ...artifactComponentData,
      } as Parameters<typeof generateArtifactComponentDefinition>[0],
    })
  );
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
      contextConfigRecordsById.set(contextConfigId, {
        id: contextConfigId,
        filePath: join(context.paths.contextConfigsDir, `${contextConfigId}.ts`),
        payload: {
          contextConfigId,
          ...contextConfig,
        } as Parameters<typeof generateContextConfigDefinition>[0],
      });
    }
  }

  return [...contextConfigRecordsById.values()];
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
        filePath: join(context.paths.agentsDir, 'triggers', `${triggerId}.ts`),
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
    records.push({
      id: agentId,
      filePath: join(context.paths.agentsDir, `${agentId}.ts`),
      payload: {
        agentId,
        ...agentData,
      } as Parameters<typeof generateAgentDefinition>[0],
    });
  }
  return records;
}

function collectProjectRecord(
  context: GenerationContext
): Array<GenerationRecord<Parameters<typeof generateProjectDefinition>[0]>> {
  return [
    {
      id: context.project.id,
      filePath: join(context.paths.projectRoot, 'index.ts'),
      payload: {
        projectId: context.project.id,
        name: context.project.name,
        description: context.project.description,
        models: context.project.models,
        stopWhen: context.project.stopWhen,
        agents: [...context.completeAgentIds],
        tools: getObjectKeys(context.project.tools),
        externalAgents: getObjectKeys(context.project.externalAgents),
        dataComponents: getObjectKeys(context.project.dataComponents),
        artifactComponents: getObjectKeys(context.project.artifactComponents),
        credentialReferences: getObjectKeys(context.project.credentialReferences),
      } as Parameters<typeof generateProjectDefinition>[0],
    },
  ];
}

function validateProject(project: FullProjectDefinition) {
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

function collectCompleteAgentIds(project: FullProjectDefinition, skippedAgents: SkippedAgent[]) {
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
  if (!asRecord(data.subAgents) || Object.keys(data.subAgents).length === 0) {
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
    dataComponents: getObjectKeys(project.dataComponents).length,
    externalAgents: getObjectKeys(project.externalAgents).length,
    statusComponents: countStatusComponents(project),
  };
}

function countStatusComponents(project: FullProjectDefinition) {
  let total = 0;
  for (const agentData of Object.values(project.agents ?? {})) {
    const statusComponents = asRecord(agentData)?.statusUpdates;
    if (!asRecord(statusComponents)) {
      continue;
    }
    const entries = statusComponents.statusComponents;
    if (Array.isArray(entries)) {
      total += entries.length;
    }
  }
  return total;
}

function hasUnsupportedComponents(counts: UnsupportedComponentCounts) {
  return Object.values(counts).some((value) => value > 0);
}

function formatUnsupportedComponentsError(counts: UnsupportedComponentCounts) {
  return `Unsupported components for v4 introspect: ${formatUnsupportedCounts(counts)}`;
}

function formatUnsupportedComponentsWarning(counts: UnsupportedComponentCounts) {
  return `Skipped unsupported components for v4 introspect: ${formatUnsupportedCounts(counts)}`;
}

function formatUnsupportedCounts(counts: UnsupportedComponentCounts) {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  return value as Record<string, unknown>;
}

function writeTypeScriptFile(filePath: string, content: string, writeMode: 'merge' | 'overwrite') {
  mkdirSync(dirname(filePath), { recursive: true });

  if (writeMode === 'merge' && existsSync(filePath)) {
    const existingContent = readFileSync(filePath, 'utf-8');
    const mergedContent = mergeSafely(existingContent, content);
    writeFileSync(filePath, `${mergedContent}\n`, 'utf-8');
    return;
  }

  writeFileSync(filePath, `${content}\n`, 'utf-8');
}

function mergeSafely(existingContent: string, generatedContent: string) {
  try {
    return mergeGeneratedModule(existingContent, generatedContent);
  } catch {
    return generatedContent;
  }
}
