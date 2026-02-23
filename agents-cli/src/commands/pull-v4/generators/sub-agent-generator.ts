import { FullAgentAgentInsertSchema } from '@inkeep/agents-core';
import { type ObjectLiteralExpression, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addStringProperty,
  addValueToObject,
  collectTemplateVariableNames,
  convertNullToUndefined,
  createFactoryDefinition,
  formatInlineLiteral,
  formatTemplate,
  hasReferences,
  isPlainObject,
  resolveReferenceName,
  toCamelCase,
} from '../utils';

const ReferenceNameByIdSchema = z.record(z.string(), z.string().nonempty());

const ReferenceOverridesSchema = z.object({
  tools: ReferenceNameByIdSchema.optional(),
  subAgents: ReferenceNameByIdSchema.optional(),
  agents: ReferenceNameByIdSchema.optional(),
  externalAgents: ReferenceNameByIdSchema.optional(),
  dataComponents: ReferenceNameByIdSchema.optional(),
  artifactComponents: ReferenceNameByIdSchema.optional(),
});

const ContextTemplateReferenceSchema = z.object({
  name: z.string().nonempty(),
  local: z.boolean().optional(),
});

const SubAgentSchema = FullAgentAgentInsertSchema.pick({
  id: true,
  description: true,
  prompt: true,
}).extend({
  name: z.string().optional(),
  stopWhen: z.preprocess(convertNullToUndefined, FullAgentAgentInsertSchema.shape.stopWhen),
  models: z.preprocess(convertNullToUndefined, z.looseObject({}).optional()),
  skills: z.array(z.unknown()).optional(),
  canUse: z.array(z.unknown()).optional(),
  canDelegateTo: z.array(z.unknown()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  referenceOverrides: ReferenceOverridesSchema.optional(),
  contextConfigId: z.string().nonempty().optional(),
  contextConfigReference: ContextTemplateReferenceSchema.optional(),
  contextConfigHeadersReference: ContextTemplateReferenceSchema.optional(),
});

type SubAgentInput = z.input<typeof SubAgentSchema>;
type SubAgentOutput = z.output<typeof SubAgentSchema>;

export function generateSubAgentDefinition(data: SubAgentInput): SourceFile {
  const result = SubAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for sub-agent:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'subAgent',
    variableName: toCamelCase(parsed.id),
  });

  const promptTemplateVariables =
    typeof parsed.prompt === 'string' ? collectTemplateVariableNames(parsed.prompt) : [];
  const hasContextTemplateVariables = promptTemplateVariables.some(
    (variableName) => !variableName.startsWith('headers.')
  );
  const hasHeadersTemplateVariables = promptTemplateVariables.some((variableName) =>
    variableName.startsWith('headers.')
  );
  const namedImports: string[] = [];
  if (
    hasContextTemplateVariables &&
    parsed.contextConfigId &&
    parsed.contextConfigReference &&
    parsed.contextConfigReference.local !== true
  ) {
    namedImports.push(parsed.contextConfigReference.name);
  }
  if (
    hasHeadersTemplateVariables &&
    parsed.contextConfigId &&
    parsed.contextConfigHeadersReference &&
    parsed.contextConfigHeadersReference.local !== true
  ) {
    namedImports.push(parsed.contextConfigHeadersReference.name);
  }
  if (namedImports.length > 0 && parsed.contextConfigId) {
    sourceFile.addImportDeclaration({
      namedImports: [...new Set(namedImports)],
      moduleSpecifier: `../context-configs/${parsed.contextConfigId}`,
    });
  }

  addCanUseToolImports(sourceFile, parsed.canUse, parsed.referenceOverrides?.tools);
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
  });

  writeSubAgentConfig(
    configObject,
    {
      contextReference: parsed.contextConfigReference?.name,
      headersReference: parsed.contextConfigHeadersReference?.name,
    },
    parsed
  );

  return sourceFile;
}

function addCanUseToolImports(
  sourceFile: SourceFile,
  canUse?: unknown[],
  toolReferenceOverrides?: Record<string, string>
): void {
  const toolImportsById = new Map<string, string>();
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
    toolImportsById.set(toolId, resolveReferenceName(toolId, [toolReferenceOverrides]));
  }

  for (const [toolId, referenceName] of toolImportsById) {
    sourceFile.addImportDeclaration({
      namedImports: [referenceName],
      moduleSpecifier: `../../tools/${toolId}`,
    });
  }
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
  }
): void {
  const importsByTarget = new Map<string, { type: DelegateTargetType; id: string; name: string }>();

  for (const item of options.canDelegateTo ?? []) {
    const resolvedTarget = resolveDelegateTargetImport(item, options.referenceOverrides);
    if (!resolvedTarget) {
      continue;
    }
    if (resolvedTarget.type === 'subAgents' && resolvedTarget.id === options.currentSubAgentId) {
      continue;
    }
    importsByTarget.set(`${resolvedTarget.type}:${resolvedTarget.id}`, resolvedTarget);
  }

  for (const targetId of options.canTransferTo ?? []) {
    const resolvedTarget = resolveDelegateTargetImport(targetId, options.referenceOverrides);
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
      moduleSpecifier: resolveDelegateImportModuleSpecifier(target.type, target.id),
    });
  }
}

function resolveDelegateTargetImport(
  canDelegateToEntry: unknown,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
): { type: DelegateTargetType; id: string; name: string } | undefined {
  if (typeof canDelegateToEntry === 'string') {
    const resolvedType = resolveDelegateTargetType(canDelegateToEntry, referenceOverrides);
    if (!resolvedType) {
      return;
    }

    return {
      type: resolvedType,
      id: canDelegateToEntry,
      name: resolveReferenceName(canDelegateToEntry, [referenceOverrides[resolvedType]]),
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
    };
  }

  if (typeof canDelegateToEntry.agentId === 'string') {
    return {
      type: 'agents',
      id: canDelegateToEntry.agentId,
      name: resolveReferenceName(canDelegateToEntry.agentId, [referenceOverrides.agents]),
    };
  }

  if (typeof canDelegateToEntry.externalAgentId === 'string') {
    return {
      type: 'externalAgents',
      id: canDelegateToEntry.externalAgentId,
      name: resolveReferenceName(canDelegateToEntry.externalAgentId, [
        referenceOverrides.externalAgents,
      ]),
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

function resolveDelegateImportModuleSpecifier(type: DelegateTargetType, id: string): string {
  switch (type) {
    case 'subAgents':
      return `./${id}`;
    case 'agents':
      return `../${id}`;
    case 'externalAgents':
      return `../../external-agents/${id}`;
  }
}

function writeSubAgentConfig(
  configObject: ObjectLiteralExpression,
  templateReferences: {
    contextReference?: string;
    headersReference?: string;
  },
  {
    dataComponents,
    name,
    canDelegateTo,
    canTransferTo,
    skills,
    artifactComponents,
    canUse,
    referenceOverrides,
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

  const canUseReferences = collectCanUseReferences(canUse, referenceOverrides?.tools);
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

function resolveSubAgentName(subAgentId: string, name?: string): string {
  if (name !== undefined) {
    return name;
  }

  return subAgentId
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectCanUseReferences(
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

function collectCanDelegateToReferences(
  canDelegateTo: unknown[] | undefined,
  referenceOverrides: {
    subAgents?: Record<string, string>;
    agents?: Record<string, string>;
    externalAgents?: Record<string, string>;
  }
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

function collectSkills(skills?: unknown[]): string[] {
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
