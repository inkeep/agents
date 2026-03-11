import { FullAgentAgentInsertSchema } from '@inkeep/agents-core';
import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addStringProperty,
  addValueToObject,
  collectTemplateVariableNames,
  createFactoryDefinition,
  formatTemplate,
  hasReferences,
  isPlainObject,
  resolveContextTemplateImports,
  resolveNonCollidingName,
  resolveReferenceName,
} from '../utils';
import {
  collectCanDelegateToReferences,
  collectCanUseReferences,
  collectSkills,
  resolveSubAgentName,
  resolveSubAgentVariableName,
} from './sub-agent-generator.helpers';

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  tools: ReferenceNameByIdSchema.optional(),
  subAgents: ReferenceNameByIdSchema.optional(),
  agents: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
});

const ReferencePathOverridesSchema = z.object({
  tools: ReferenceNameByIdSchema.optional(),
  subAgents: ReferenceNameByIdSchema.optional(),
  agents: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
});

const ContextTemplateReferenceSchema = z.object({
  name: z.string().nonempty(),
  local: z.boolean().optional(),
});

const MySchema = FullAgentAgentInsertSchema.pick({
  id: true,
  prompt: true,
  name: true,
  description: true,
  stopWhen: true,
});

const SubAgentSchema = z.strictObject({
  ...MySchema.shape,
  prompt: z.preprocess((v) => v || undefined, MySchema.shape.prompt),
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  stopWhen: z.preprocess((v) => v ?? undefined, MySchema.shape.stopWhen),
  models: z.preprocess((v) => v ?? undefined, z.looseObject({}).optional()),
  skills: z.array(z.unknown()).optional(),
  canUse: z.array(z.unknown()).optional(),
  canDelegateTo: z.array(z.unknown()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
  referencePathOverrides: ReferencePathOverridesSchema.optional(),
  contextConfigId: z.string().nonempty().optional(),
  contextConfigReference: ContextTemplateReferenceSchema.optional(),
  contextConfigHeadersReference: ContextTemplateReferenceSchema.optional(),
});

type SubAgentInput = z.input<typeof SubAgentSchema>;
type SubAgentOutput = z.output<typeof SubAgentSchema>;

export function generateSubAgentDefinition({
  subAgentId,
  ...data
}: SubAgentInput & Record<string, unknown>): SourceFile {
  const result = SubAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for sub-agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const subAgentVariableName = resolveSubAgentVariableName(parsed.id, parsed.name);
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'subAgent',
    variableName: subAgentVariableName,
  });
  const reservedReferenceNames = new Set([subAgentVariableName]);

  const promptTemplateVariables =
    typeof parsed.prompt === 'string' ? collectTemplateVariableNames(parsed.prompt) : [];
  const hasContextTemplateVariables = promptTemplateVariables.some(
    (variableName) => !variableName.startsWith('headers.')
  );
  const hasHeadersTemplateVariables = promptTemplateVariables.some((variableName) =>
    variableName.startsWith('headers.')
  );
  const contextImportResolution = resolveContextTemplateImports({
    reservedNames: reservedReferenceNames,
    shouldResolveContextReference: hasContextTemplateVariables && Boolean(parsed.contextConfigId),
    shouldResolveHeadersReference: hasHeadersTemplateVariables && Boolean(parsed.contextConfigId),
    contextConfigReference: parsed.contextConfigReference,
    contextConfigHeadersReference: parsed.contextConfigHeadersReference,
  });
  if (contextImportResolution.namedImports.length > 0 && parsed.contextConfigId) {
    sourceFile.addImportDeclaration({
      namedImports: contextImportResolution.namedImports,
      moduleSpecifier: `../../context-configs/${parsed.contextConfigId}`,
    });
  }

  const canUseToolReferenceOverrides = addCanUseToolImports(
    sourceFile,
    parsed.canUse,
    parsed.referenceOverrides?.tools,
    parsed.referencePathOverrides?.tools,
    reservedReferenceNames
  );
  addDataComponentImports(
    sourceFile,
    parsed.dataComponents,
    parsed.referenceOverrides?.dataComponents
  );
  addArtifactComponentImports(
    sourceFile,
    parsed.artifactComponents,
    parsed.referenceOverrides?.artifactComponents
  );
  addDelegateTargetImports(sourceFile, {
    currentSubAgentId: parsed.id,
    canDelegateTo: parsed.canDelegateTo,
    canTransferTo: parsed.canTransferTo,
    referenceOverrides: {
      subAgents: parsed.referenceOverrides?.subAgents,
      agents: parsed.referenceOverrides?.agents,
      externalAgents: parsed.referenceOverrides?.externalAgents,
    },
    referencePathOverrides: {
      subAgents: parsed.referencePathOverrides?.subAgents,
      agents: parsed.referencePathOverrides?.agents,
      externalAgents: parsed.referencePathOverrides?.externalAgents,
    },
  });

  writeSubAgentConfig(
    configObject,
    {
      contextReference: contextImportResolution.contextReferenceName,
      headersReference: contextImportResolution.headersReferenceName,
    },
    canUseToolReferenceOverrides,
    parsed
  );

  return sourceFile;
}

function addCanUseToolImports(
  sourceFile: SourceFile,
  canUse?: unknown[],
  toolReferenceOverrides?: Record<string, string>,
  toolReferencePathOverrides?: Record<string, string>,
  reservedReferenceNames?: Set<string>
): Record<string, string> {
  const toolImportsById = new Map<string, { importName: string; modulePath: string }>();
  for (const item of canUse ?? []) {
    const toolId =
      typeof item === 'string'
        ? item
        : isPlainObject(item) && typeof item.toolId === 'string'
          ? item.toolId
          : undefined;
    if (!toolId || toolImportsById.has(toolId)) {
      continue;
    }
    toolImportsById.set(toolId, {
      importName: resolveReferenceName(toolId, [toolReferenceOverrides]),
      modulePath: resolveReferenceName(toolId, [toolReferencePathOverrides]),
    });
  }

  const localReferenceNamesByToolId: Record<string, string> = {};
  const localNames = reservedReferenceNames ?? new Set<string>();
  for (const [toolId, { importName, modulePath }] of toolImportsById) {
    const localName = resolveNonCollidingName(importName, localNames);
    localReferenceNamesByToolId[toolId] = localName;
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === localName ? importName : { name: importName, alias: localName },
      ],
      moduleSpecifier: `../../tools/${modulePath}`,
    });
  }

  return localReferenceNamesByToolId;
}

function addDataComponentImports(
  sourceFile: SourceFile,
  dataComponents?: string[],
  dataComponentReferenceOverrides?: Record<string, string>
): void {
  addReferenceImports(
    sourceFile,
    dataComponents,
    '../../data-components',
    dataComponentReferenceOverrides
  );
}

function addArtifactComponentImports(
  sourceFile: SourceFile,
  artifactComponents?: string[],
  artifactComponentReferenceOverrides?: Record<string, string>
): void {
  addReferenceImports(
    sourceFile,
    artifactComponents,
    '../../artifact-components',
    artifactComponentReferenceOverrides
  );
}

function addReferenceImports(
  sourceFile: SourceFile,
  references: string[] | undefined,
  basePath: string,
  referenceOverrides?: Record<string, string>
): void {
  const importByReferenceId = new Map<string, string>();
  for (const referenceId of references ?? []) {
    if (!referenceId || importByReferenceId.has(referenceId)) {
      continue;
    }

    importByReferenceId.set(referenceId, resolveReferenceName(referenceId, [referenceOverrides]));
  }

  for (const [referenceId, referenceName] of importByReferenceId) {
    sourceFile.addImportDeclaration({
      namedImports: [referenceName],
      moduleSpecifier: `${basePath}/${referenceId}`,
    });
  }
}

type DelegateTargetType = 'subAgents' | 'agents' | 'externalAgents';

function addDelegateTargetImports(
  sourceFile: SourceFile,
  options: {
    currentSubAgentId: string;
    canDelegateTo?: unknown[];
    canTransferTo?: string[];
    referenceOverrides: {
      subAgents?: Record<string, string>;
      agents?: Record<string, string>;
      externalAgents?: Record<string, string>;
    };
    referencePathOverrides?: {
      subAgents?: Record<string, string>;
      agents?: Record<string, string>;
      externalAgents?: Record<string, string>;
    };
  }
): void {
  const importsByTarget = new Map<
    string,
    { type: DelegateTargetType; id: string; name: string; modulePath?: string }
  >();

  for (const item of options.canDelegateTo ?? []) {
    const resolvedTarget = resolveDelegateTargetImport(
      item,
      options.referenceOverrides,
      options.referencePathOverrides
    );
    if (!resolvedTarget) {
      continue;
    }
    if (resolvedTarget.type === 'subAgents' && resolvedTarget.id === options.currentSubAgentId) {
      continue;
    }
    importsByTarget.set(`${resolvedTarget.type}:${resolvedTarget.id}`, resolvedTarget);
  }

  for (const targetId of options.canTransferTo ?? []) {
    const resolvedTarget = resolveDelegateTargetImport(
      targetId,
      options.referenceOverrides,
      options.referencePathOverrides
    );
    if (!resolvedTarget) {
      continue;
    }
    if (resolvedTarget.type === 'subAgents' && resolvedTarget.id === options.currentSubAgentId) {
      continue;
    }
    importsByTarget.set(`${resolvedTarget.type}:${resolvedTarget.id}`, resolvedTarget);
  }

  for (const target of importsByTarget.values()) {
    sourceFile.addImportDeclaration({
      namedImports: [target.name],
      moduleSpecifier: resolveDelegateImportModuleSpecifier(
        target.type,
        target.id,
        target.modulePath
      ),
    });
  }
}

function resolveDelegateTargetImport(
  canDelegateToEntry: unknown,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  },
  referencePathOverrides?: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
): { type: DelegateTargetType; id: string; name: string; modulePath?: string } | undefined {
  if (typeof canDelegateToEntry === 'string') {
    const resolvedType = resolveDelegateTargetType(canDelegateToEntry, referenceOverrides);
    if (!resolvedType) {
      return;
    }

    return {
      type: resolvedType,
      id: canDelegateToEntry,
      name: resolveReferenceName(canDelegateToEntry, [referenceOverrides[resolvedType]]),
      ...((resolvedType === 'subAgents' && {
        modulePath: referencePathOverrides?.subAgents?.[canDelegateToEntry],
      }) ||
        (resolvedType === 'agents' && {
          modulePath: referencePathOverrides?.agents?.[canDelegateToEntry],
        }) ||
        (resolvedType === 'externalAgents' && {
          modulePath: referencePathOverrides?.externalAgents?.[canDelegateToEntry],
        })),
    };
  }

  if (!isPlainObject(canDelegateToEntry)) {
    return;
  }

  if (typeof canDelegateToEntry.subAgentId === 'string') {
    return {
      type: 'subAgents',
      id: canDelegateToEntry.subAgentId,
      name: resolveReferenceName(canDelegateToEntry.subAgentId, [referenceOverrides.subAgents]),
      modulePath: referencePathOverrides?.subAgents?.[canDelegateToEntry.subAgentId],
    };
  }

  if (typeof canDelegateToEntry.agentId === 'string') {
    return {
      type: 'agents',
      id: canDelegateToEntry.agentId,
      name: resolveReferenceName(canDelegateToEntry.agentId, [referenceOverrides.agents]),
      modulePath: referencePathOverrides?.agents?.[canDelegateToEntry.agentId],
    };
  }

  if (typeof canDelegateToEntry.externalAgentId === 'string') {
    return {
      type: 'externalAgents',
      id: canDelegateToEntry.externalAgentId,
      name: resolveReferenceName(canDelegateToEntry.externalAgentId, [
        referenceOverrides.externalAgents,
      ]),
      modulePath: referencePathOverrides?.externalAgents?.[canDelegateToEntry.externalAgentId],
    };
  }
}

function resolveDelegateTargetType(
  targetId: string,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
): DelegateTargetType | undefined {
  if (referenceOverrides.subAgents?.[targetId]) {
    return 'subAgents';
  }
  if (referenceOverrides.agents?.[targetId]) {
    return 'agents';
  }
  if (referenceOverrides.externalAgents?.[targetId]) {
    return 'externalAgents';
  }

  return 'subAgents';
}

function resolveDelegateImportModuleSpecifier(
  type: DelegateTargetType,
  id: string,
  modulePath?: string
): string {
  const path = modulePath ?? id;
  switch (type) {
    case 'subAgents':
      return `./${path}`;
    case 'agents':
      return `../${path}`;
    case 'externalAgents':
      return `../../external-agents/${path}`;
  }
}

function writeSubAgentConfig(
  configObject: ObjectLiteralExpression,
  templateReferences: {
    contextReference?: string;
    headersReference?: string;
  },
  canUseToolReferenceOverrides: Record<string, string>,
  {
    dataComponents,
    name,
    canDelegateTo,
    canTransferTo,
    skills,
    artifactComponents,
    canUse,
    referenceOverrides,
    referencePathOverrides: _referencePathOverrides,
    contextConfigId: _contextConfigId,
    contextConfigReference: _contextConfigReference,
    contextConfigHeadersReference: _contextConfigHeadersReference,
    ...rest
  }: SubAgentOutput
) {
  rest = { ...rest };
  rest.prompt &&= formatTemplate(rest.prompt, templateReferences);
  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  addStringProperty(configObject, 'name', resolveSubAgentName(rest.id, name));

  const canUseReferences = collectCanUseReferences(
    canUse,
    Object.keys(canUseToolReferenceOverrides).length
      ? canUseToolReferenceOverrides
      : referenceOverrides?.tools
  );
  if (canUseReferences.length) {
    addReferenceGetterProperty(configObject, 'canUse', canUseReferences);
  }

  const canDelegateToReferences = collectCanDelegateToReferences(canDelegateTo, {
    subAgents: referenceOverrides?.subAgents,
    agents: referenceOverrides?.agents,
    externalAgents: referenceOverrides?.externalAgents,
  });
  if (canDelegateToReferences.length) {
    addReferenceGetterProperty(configObject, 'canDelegateTo', canDelegateToReferences);
  }

  if (hasReferences(canTransferTo)) {
    addReferenceGetterProperty(
      configObject,
      'canTransferTo',
      canTransferTo.map((id) =>
        resolveReferenceName(id, [
          referenceOverrides?.subAgents,
          referenceOverrides?.agents,
          referenceOverrides?.externalAgents,
        ])
      )
    );
  }

  if (hasReferences(dataComponents)) {
    addReferenceGetterProperty(
      configObject,
      'dataComponents',
      dataComponents.map((id) => resolveReferenceName(id, [referenceOverrides?.dataComponents]))
    );
  }

  if (hasReferences(artifactComponents)) {
    addReferenceGetterProperty(
      configObject,
      'artifactComponents',
      artifactComponents.map((id) =>
        resolveReferenceName(id, [referenceOverrides?.artifactComponents])
      )
    );
  }

  const collectedSkills = collectSkills(skills);
  if (collectedSkills.length > 0) {
    const skillsProperty = configObject.addPropertyAssignment({
      name: 'skills',
      initializer: '() => []',
    });
    const skillsGetter = skillsProperty.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);
    const skillsArray = skillsGetter.getBody().asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    for (const skill of collectedSkills) {
      skillsArray.addElement(skill);
    }
  }
}
