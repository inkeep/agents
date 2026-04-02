import { HTTPException } from 'hono/http-exception';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import type {
  ArtifactComponentSelect,
  DataComponentSelect,
  ExternalAgentSelect,
  FullAgentDefinition,
  FunctionApiInsert,
  ImportAgentRequest,
  ImportAgentResponse,
  ImportAgentWarning,
  SkillFileSelect,
  ToolSelect,
} from '../../types/entities';
import type { AgentScopeConfig, ProjectScopeConfig } from '../../types/utility';
import { createApiError, throwIfUniqueConstraintError } from '../../utils/error';
import { buildCopiedAgentDefinition } from './agentDuplicate';
import { type AgentLogger, createFullAgentServerSide } from './agentFull';
import { getAgentById, getFullAgentDefinition } from './agents';
import { createArtifactComponent, getArtifactComponentById } from './artifactComponents';
import { getCredentialReference } from './credentialReferences';
import { createDataComponent, getDataComponent } from './dataComponents';
import { createExternalAgent, getExternalAgent } from './externalAgents';
import { getFunction, upsertFunction } from './functions';
import { createSkill, getSkillByIdWithFiles } from './skills';
import { createTool, getToolById } from './tools';

interface ImportAgentParams extends ImportAgentRequest {
  scopes: ProjectScopeConfig;
}

type SourceSkill = NonNullable<Awaited<ReturnType<ReturnType<typeof getSkillByIdWithFiles>>>>;

type ReferencedSourceDependencies = ReturnType<typeof collectReferencedDependencyIds> & {
  tools: Map<string, ToolSelect>;
  externalAgents: Map<string, ExternalAgentSelect>;
  dataComponents: Map<string, DataComponentSelect>;
  artifactComponents: Map<string, ArtifactComponentSelect>;
  functions: Map<string, FunctionApiInsert>;
  skills: Map<string, SourceSkill>;
};

const defaultLogger: AgentLogger = {
  info: () => {},
  error: () => {},
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toStableValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, toStableValue(nestedValue)])
    );
  }

  return value;
};

const areNormalizedValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(toStableValue(left)) === JSON.stringify(toStableValue(right));

const normalizeTool = (tool: ToolSelect, credentialReferenceId: string | null) => ({
  name: tool.name,
  description: tool.description ?? null,
  config: tool.config,
  credentialReferenceId,
  credentialScope: tool.credentialScope,
  headers: tool.headers ?? null,
  imageUrl: tool.imageUrl ?? null,
  isWorkApp: tool.isWorkApp,
});

const normalizeExternalAgent = (
  externalAgent: ExternalAgentSelect,
  credentialReferenceId: string | null
) => ({
  name: externalAgent.name,
  description: externalAgent.description ?? null,
  baseUrl: externalAgent.baseUrl,
  credentialReferenceId,
});

const normalizeDataComponent = (dataComponent: DataComponentSelect) => ({
  name: dataComponent.name,
  description: dataComponent.description ?? null,
  props: dataComponent.props,
  render: dataComponent.render ?? null,
});

const normalizeArtifactComponent = (artifactComponent: ArtifactComponentSelect) => ({
  name: artifactComponent.name,
  description: artifactComponent.description ?? null,
  props: artifactComponent.props,
  render: artifactComponent.render ?? null,
});

const normalizeFunction = (func: FunctionApiInsert) => ({
  inputSchema: func.inputSchema ?? null,
  executeCode: func.executeCode,
  dependencies: func.dependencies ?? {},
});

const normalizeSkillFiles = (files: SkillFileSelect[]) =>
  [...files]
    .sort((left, right) => left.filePath.localeCompare(right.filePath))
    .map((file) => ({
      filePath: file.filePath,
      content: file.content,
    }));

const normalizeSkill = (skill: SourceSkill) => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  content: skill.content,
  metadata: skill.metadata ?? null,
  files: normalizeSkillFiles(skill.files),
});

const collectReferencedDependencyIds = (sourceAgent: FullAgentDefinition) => {
  const functionToolIds = new Set(Object.keys(sourceAgent.functionTools ?? {}));
  const toolIds = new Set<string>();
  const externalAgentIds = new Set<string>();
  const dataComponentIds = new Set<string>();
  const artifactComponentIds = new Set<string>();
  const skillIds = new Set<string>();
  const functionIds = new Set<string>();
  let hasTeamAgentDelegation = false;

  for (const subAgent of Object.values(sourceAgent.subAgents)) {
    for (const canUseItem of subAgent.canUse ?? []) {
      if (!functionToolIds.has(canUseItem.toolId)) {
        toolIds.add(canUseItem.toolId);
      }
    }

    for (const delegateTarget of subAgent.canDelegateTo ?? []) {
      if (typeof delegateTarget === 'string') {
        continue;
      }

      if ('externalAgentId' in delegateTarget) {
        externalAgentIds.add(delegateTarget.externalAgentId);
        continue;
      }

      hasTeamAgentDelegation = true;
    }

    for (const dataComponentId of subAgent.dataComponents ?? []) {
      dataComponentIds.add(dataComponentId);
    }

    for (const artifactComponentId of subAgent.artifactComponents ?? []) {
      artifactComponentIds.add(artifactComponentId);
    }

    for (const skill of subAgent.skills ?? []) {
      skillIds.add(skill.id);
    }
  }

  for (const functionTool of Object.values(sourceAgent.functionTools ?? {})) {
    functionIds.add(functionTool.functionId);
  }

  return {
    toolIds,
    externalAgentIds,
    dataComponentIds,
    artifactComponentIds,
    skillIds,
    functionIds,
    hasTeamAgentDelegation,
  };
};

const loadReferencedSourceDependencies = async (params: {
  sourceDb: AgentsManageDatabaseClient;
  sourceScopes: ProjectScopeConfig;
  sourceAgent: FullAgentDefinition;
}): Promise<ReferencedSourceDependencies> => {
  const referencedDependencyIds = collectReferencedDependencyIds(params.sourceAgent);

  const tools = new Map<string, ToolSelect>();
  for (const toolId of referencedDependencyIds.toolIds) {
    const sourceTool = await getToolById(params.sourceDb)({
      scopes: params.sourceScopes,
      toolId,
    });

    if (!sourceTool) {
      throw createApiError({
        code: 'not_found',
        message: `Source tool '${toolId}' not found`,
      });
    }

    tools.set(toolId, sourceTool);
  }

  const externalAgents = new Map<string, ExternalAgentSelect>();
  for (const externalAgentId of referencedDependencyIds.externalAgentIds) {
    const sourceExternalAgent = await getExternalAgent(params.sourceDb)({
      scopes: params.sourceScopes,
      externalAgentId,
    });

    if (!sourceExternalAgent) {
      throw createApiError({
        code: 'not_found',
        message: `Source external agent '${externalAgentId}' not found`,
      });
    }

    externalAgents.set(externalAgentId, sourceExternalAgent);
  }

  const dataComponents = new Map<string, DataComponentSelect>();
  for (const dataComponentId of referencedDependencyIds.dataComponentIds) {
    const sourceDataComponent = await getDataComponent(params.sourceDb)({
      scopes: params.sourceScopes,
      dataComponentId,
    });

    if (!sourceDataComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Source data component '${dataComponentId}' not found`,
      });
    }

    dataComponents.set(dataComponentId, sourceDataComponent);
  }

  const artifactComponents = new Map<string, ArtifactComponentSelect>();
  for (const artifactComponentId of referencedDependencyIds.artifactComponentIds) {
    const sourceArtifactComponent = await getArtifactComponentById(params.sourceDb)({
      scopes: params.sourceScopes,
      id: artifactComponentId,
    });

    if (!sourceArtifactComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Source artifact component '${artifactComponentId}' not found`,
      });
    }

    artifactComponents.set(artifactComponentId, sourceArtifactComponent);
  }

  const functions = new Map<string, FunctionApiInsert>();
  for (const functionId of referencedDependencyIds.functionIds) {
    const sourceFunction = await getFunction(params.sourceDb)({
      scopes: params.sourceScopes,
      functionId,
    });

    if (!sourceFunction) {
      throw createApiError({
        code: 'not_found',
        message: `Source function '${functionId}' not found`,
      });
    }

    functions.set(functionId, sourceFunction);
  }

  const skills = new Map<string, SourceSkill>();
  for (const skillId of referencedDependencyIds.skillIds) {
    const sourceSkill = await getSkillByIdWithFiles(params.sourceDb)({
      scopes: params.sourceScopes,
      skillId,
    });

    if (!sourceSkill) {
      throw createApiError({
        code: 'not_found',
        message: `Source skill '${skillId}' not found`,
      });
    }

    skills.set(skillId, sourceSkill);
  }

  return {
    ...referencedDependencyIds,
    tools,
    externalAgents,
    dataComponents,
    artifactComponents,
    functions,
    skills,
  };
};

const resolveCredentialReferenceId = async (params: {
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
  warnings: ImportAgentWarning[];
  credentialReferenceId: string | null | undefined;
  resourceType: ImportAgentWarning['resourceType'];
  resourceId: string;
}): Promise<string | null> => {
  if (!params.credentialReferenceId) {
    return null;
  }

  const credentialReference = await getCredentialReference(params.targetDb)({
    scopes: params.targetScopes,
    id: params.credentialReferenceId,
  });

  if (credentialReference) {
    return params.credentialReferenceId;
  }

  params.warnings.push({
    code: 'credential_missing',
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    credentialReferenceId: params.credentialReferenceId,
  });

  return null;
};

const ensureToolInTargetProject = async (params: {
  sourceTool: ToolSelect;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
  warnings: ImportAgentWarning[];
}) => {
  const credentialReferenceId = await resolveCredentialReferenceId({
    targetDb: params.targetDb,
    targetScopes: params.targetScopes,
    warnings: params.warnings,
    credentialReferenceId: params.sourceTool.credentialReferenceId,
    resourceType: 'tool',
    resourceId: params.sourceTool.id,
  });

  const existingTool = await getToolById(params.targetDb)({
    scopes: params.targetScopes,
    toolId: params.sourceTool.id,
  });

  if (existingTool) {
    if (
      !areNormalizedValuesEqual(
        normalizeTool(params.sourceTool, credentialReferenceId),
        normalizeTool(existingTool, existingTool.credentialReferenceId ?? null)
      )
    ) {
      throw createApiError({
        code: 'conflict',
        message: `Tool '${params.sourceTool.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await createTool(params.targetDb)({
    tenantId: params.targetScopes.tenantId,
    projectId: params.targetScopes.projectId,
    id: params.sourceTool.id,
    name: params.sourceTool.name,
    description: params.sourceTool.description,
    config: params.sourceTool.config,
    credentialReferenceId: credentialReferenceId ?? undefined,
    credentialScope: params.sourceTool.credentialScope,
    headers: params.sourceTool.headers,
    imageUrl: params.sourceTool.imageUrl,
    capabilities: params.sourceTool.capabilities,
    lastError: params.sourceTool.lastError,
    isWorkApp: params.sourceTool.isWorkApp,
  });
};

const ensureExternalAgentInTargetProject = async (params: {
  sourceExternalAgent: ExternalAgentSelect;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
  warnings: ImportAgentWarning[];
}) => {
  const credentialReferenceId = await resolveCredentialReferenceId({
    targetDb: params.targetDb,
    targetScopes: params.targetScopes,
    warnings: params.warnings,
    credentialReferenceId: params.sourceExternalAgent.credentialReferenceId,
    resourceType: 'externalAgent',
    resourceId: params.sourceExternalAgent.id,
  });

  const existingExternalAgent = await getExternalAgent(params.targetDb)({
    scopes: params.targetScopes,
    externalAgentId: params.sourceExternalAgent.id,
  });

  if (existingExternalAgent) {
    if (
      !areNormalizedValuesEqual(
        normalizeExternalAgent(params.sourceExternalAgent, credentialReferenceId),
        normalizeExternalAgent(
          existingExternalAgent,
          existingExternalAgent.credentialReferenceId ?? null
        )
      )
    ) {
      throw createApiError({
        code: 'conflict',
        message: `External agent '${params.sourceExternalAgent.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await createExternalAgent(params.targetDb)({
    tenantId: params.targetScopes.tenantId,
    projectId: params.targetScopes.projectId,
    id: params.sourceExternalAgent.id,
    name: params.sourceExternalAgent.name,
    description: params.sourceExternalAgent.description,
    baseUrl: params.sourceExternalAgent.baseUrl,
    credentialReferenceId: credentialReferenceId ?? undefined,
  });
};

const ensureDataComponentInTargetProject = async (params: {
  sourceDataComponent: DataComponentSelect;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
}) => {
  const existingDataComponent = await getDataComponent(params.targetDb)({
    scopes: params.targetScopes,
    dataComponentId: params.sourceDataComponent.id,
  });

  if (existingDataComponent) {
    if (
      !areNormalizedValuesEqual(
        normalizeDataComponent(params.sourceDataComponent),
        normalizeDataComponent(existingDataComponent)
      )
    ) {
      throw createApiError({
        code: 'conflict',
        message: `Data component '${params.sourceDataComponent.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await createDataComponent(params.targetDb)({
    tenantId: params.targetScopes.tenantId,
    projectId: params.targetScopes.projectId,
    id: params.sourceDataComponent.id,
    name: params.sourceDataComponent.name,
    description: params.sourceDataComponent.description,
    props: params.sourceDataComponent.props,
    render: params.sourceDataComponent.render,
  });
};

const ensureArtifactComponentInTargetProject = async (params: {
  sourceArtifactComponent: ArtifactComponentSelect;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
}) => {
  const existingArtifactComponent = await getArtifactComponentById(params.targetDb)({
    scopes: params.targetScopes,
    id: params.sourceArtifactComponent.id,
  });

  if (existingArtifactComponent) {
    if (
      !areNormalizedValuesEqual(
        normalizeArtifactComponent(params.sourceArtifactComponent),
        normalizeArtifactComponent(existingArtifactComponent)
      )
    ) {
      throw createApiError({
        code: 'conflict',
        message: `Artifact component '${params.sourceArtifactComponent.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await createArtifactComponent(params.targetDb)({
    tenantId: params.targetScopes.tenantId,
    projectId: params.targetScopes.projectId,
    id: params.sourceArtifactComponent.id,
    name: params.sourceArtifactComponent.name,
    description: params.sourceArtifactComponent.description,
    props: params.sourceArtifactComponent.props,
    render: params.sourceArtifactComponent.render,
  });
};

const ensureFunctionInTargetProject = async (params: {
  sourceFunction: FunctionApiInsert;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
}) => {
  const existingFunction = await getFunction(params.targetDb)({
    scopes: params.targetScopes,
    functionId: params.sourceFunction.id,
  });

  if (existingFunction) {
    if (
      !areNormalizedValuesEqual(
        normalizeFunction(params.sourceFunction),
        normalizeFunction(existingFunction)
      )
    ) {
      throw createApiError({
        code: 'conflict',
        message: `Function '${params.sourceFunction.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await upsertFunction(params.targetDb)({
    scopes: params.targetScopes,
    data: {
      id: params.sourceFunction.id,
      inputSchema: params.sourceFunction.inputSchema,
      executeCode: params.sourceFunction.executeCode,
      dependencies: params.sourceFunction.dependencies ?? {},
    },
  });
};

const ensureSkillInTargetProject = async (params: {
  sourceSkill: SourceSkill;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
}) => {
  const existingSkill = await getSkillByIdWithFiles(params.targetDb)({
    scopes: params.targetScopes,
    skillId: params.sourceSkill.id,
  });

  if (existingSkill) {
    if (
      !areNormalizedValuesEqual(normalizeSkill(params.sourceSkill), normalizeSkill(existingSkill))
    ) {
      throw createApiError({
        code: 'conflict',
        message: `Skill '${params.sourceSkill.id}' already exists in target project with different configuration`,
      });
    }

    return;
  }

  await createSkill(params.targetDb)({
    tenantId: params.targetScopes.tenantId,
    projectId: params.targetScopes.projectId,
    name: params.sourceSkill.name,
    description: params.sourceSkill.description,
    content: params.sourceSkill.content,
    metadata: params.sourceSkill.metadata ?? null,
    files: normalizeSkillFiles(params.sourceSkill.files),
  });
};

const ensureReferencedDependenciesInTargetProject = async (params: {
  sourceDependencies: ReferencedSourceDependencies;
  targetDb: AgentsManageDatabaseClient;
  targetScopes: ProjectScopeConfig;
  warnings: ImportAgentWarning[];
}) => {
  if (params.sourceDependencies.hasTeamAgentDelegation) {
    throw createApiError({
      code: 'bad_request',
      message: 'Team-agent delegations cannot be imported across projects',
    });
  }

  for (const toolId of params.sourceDependencies.toolIds) {
    await ensureToolInTargetProject({
      sourceTool: params.sourceDependencies.tools.get(toolId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
      warnings: params.warnings,
    });
  }

  for (const externalAgentId of params.sourceDependencies.externalAgentIds) {
    await ensureExternalAgentInTargetProject({
      sourceExternalAgent: params.sourceDependencies.externalAgents.get(externalAgentId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
      warnings: params.warnings,
    });
  }

  for (const dataComponentId of params.sourceDependencies.dataComponentIds) {
    await ensureDataComponentInTargetProject({
      sourceDataComponent: params.sourceDependencies.dataComponents.get(dataComponentId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
    });
  }

  for (const artifactComponentId of params.sourceDependencies.artifactComponentIds) {
    await ensureArtifactComponentInTargetProject({
      sourceArtifactComponent:
        params.sourceDependencies.artifactComponents.get(artifactComponentId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
    });
  }

  for (const functionId of params.sourceDependencies.functionIds) {
    await ensureFunctionInTargetProject({
      sourceFunction: params.sourceDependencies.functions.get(functionId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
    });
  }

  for (const skillId of params.sourceDependencies.skillIds) {
    await ensureSkillInTargetProject({
      sourceSkill: params.sourceDependencies.skills.get(skillId)!,
      targetDb: params.targetDb,
      targetScopes: params.targetScopes,
    });
  }
};

export const importFullAgentServerSide =
  (
    targetDb: AgentsManageDatabaseClient,
    sourceDb: AgentsManageDatabaseClient,
    logger: AgentLogger = defaultLogger
  ) =>
  async (params: ImportAgentParams): Promise<ImportAgentResponse> => {
    const {
      scopes: { tenantId, projectId: targetProjectId },
      sourceProjectId,
      sourceAgentId,
      newAgentId,
      newAgentName,
    } = params;

    if (sourceProjectId === targetProjectId) {
      throw createApiError({
        code: 'bad_request',
        message:
          'Source and target project must differ. Use /duplicate to copy within the same project.',
      });
    }

    const sourceAgentScopes: AgentScopeConfig = {
      tenantId,
      projectId: sourceProjectId,
      agentId: sourceAgentId,
    };
    const targetProjectScopes: ProjectScopeConfig = {
      tenantId,
      projectId: targetProjectId,
    };

    const sourceAgent = await getFullAgentDefinition(sourceDb)({
      scopes: sourceAgentScopes,
    });

    if (!sourceAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    const sourceDependencies = await loadReferencedSourceDependencies({
      sourceDb,
      sourceScopes: { tenantId, projectId: sourceProjectId },
      sourceAgent,
    });

    try {
      return await targetDb.transaction(async (tx) => {
        const existingTargetAgent = await getAgentById(tx)({
          scopes: { tenantId, projectId: targetProjectId, agentId: newAgentId },
        });

        if (existingTargetAgent) {
          throw createApiError({
            code: 'conflict',
            message: `An agent with ID '${newAgentId}' already exists`,
          });
        }

        const warnings: ImportAgentWarning[] = [];

        await ensureReferencedDependenciesInTargetProject({
          sourceDependencies,
          targetDb: tx,
          targetScopes: targetProjectScopes,
          warnings,
        });

        const importedAgentDefinition = buildCopiedAgentDefinition(sourceAgent, {
          newAgentId,
          newAgentName,
        });

        const importedAgent = await createFullAgentServerSide(tx, logger)(
          targetProjectScopes,
          importedAgentDefinition
        );

        return {
          data: importedAgent as ImportAgentResponse['data'],
          warnings,
        };
      });
    } catch (error) {
      if (!(error instanceof HTTPException)) {
        throwIfUniqueConstraintError(error, `An agent with ID '${newAgentId}' already exists`);
      }
      throw error;
    }
  };
