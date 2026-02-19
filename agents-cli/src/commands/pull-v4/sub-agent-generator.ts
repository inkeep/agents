import { type ObjectLiteralExpression, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { z } from 'zod';
import {
  addReferenceGetterProperty,
  addStringProperty,
  addValueToObject,
  createInMemoryProject,
  formatInlineLiteral,
  isPlainObject,
  toCamelCase,
} from './utils';
import { FullAgentAgentInsertSchema } from '@inkeep/agents-core';

const TransformToUndefined = z.transform((v) => (v == null ? undefined : v));

const SubAgentSchema: z.ZodType<any> = FullAgentAgentInsertSchema.pick({
  id: true,
  description: true,
  prompt: true,
}).extend({
  name: z.string().optional(),
  stopWhen: TransformToUndefined.pipe(FullAgentAgentInsertSchema.shape.stopWhen),
  models: TransformToUndefined.pipe(z.looseObject({}).optional()),
  skills: z.array(z.unknown()).optional(),
  canUse: z.array(z.unknown()).optional(),
  canDelegateTo: z.array(z.unknown()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
});

type SubAgentInput = z.input<typeof SubAgentSchema>;

export function generateSubAgentDefinition(data: SubAgentInput): string {
  const result = SubAgentSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for sub-agent:\n${z.prettifyError(result.error)}`);
  }

  const project = createInMemoryProject();
  const parsed = result.data;
  const sourceFile = project.createSourceFile('sub-agent-definition.ts', '', { overwrite: true });
  const importName = 'subAgent';
  sourceFile.addImportDeclaration({
    namedImports: [importName],
    moduleSpecifier: '@inkeep/agents-sdk',
  });

  const subAgentVarName = toCamelCase(parsed.id);
  const variableStatement = sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{ name: subAgentVarName, initializer: `${importName}({})` }],
  });

  const [declaration] = variableStatement.getDeclarations();
  const callExpression = declaration.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const configObject = callExpression
    .getArguments()[0]
    ?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  writeSubAgentConfig(configObject, parsed);

  return sourceFile.getFullText();
}

function writeSubAgentConfig(
  configObject: ObjectLiteralExpression,
  {
    dataComponents,
    name,
    canDelegateTo,
    canTransferTo,
    skills,
    artifactComponents,
    canUse,
    ...rest
  }: SubAgentInput
) {
  for (const [k, v] of Object.entries(rest)) {
    addValueToObject(configObject, k, v);
  }
  addStringProperty(configObject, 'name', resolveSubAgentName(rest.id, name));

  const canUseReferences = collectCanUseReferences(canUse);
  if (canUseReferences.length) {
    addReferenceGetterProperty(configObject, 'canUse', canUseReferences);
  }

  const canDelegateToReferences = collectCanDelegateToReferences(canDelegateTo);
  if (canDelegateToReferences.length) {
    addReferenceGetterProperty(configObject, 'canDelegateTo', canDelegateToReferences);
  }

  if (hasReferences(canTransferTo)) {
    addReferenceGetterProperty(
      configObject,
      'canTransferTo',
      canTransferTo.map((id) => toCamelCase(id))
    );
  }

  if (hasReferences(dataComponents)) {
    addReferenceGetterProperty(
      configObject,
      'dataComponents',
      dataComponents.map((id) => toCamelCase(id))
    );
  }

  if (hasReferences(artifactComponents)) {
    addReferenceGetterProperty(
      configObject,
      'artifactComponents',
      artifactComponents.map((id) => toCamelCase(id))
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

function collectCanUseReferences(canUse?: unknown[]): string[] {
  if (!Array.isArray(canUse)) {
    return [];
  }

  const references: string[] = [];
  for (const item of canUse) {
    if (typeof item === 'string') {
      references.push(toCamelCase(item));
      continue;
    }

    if (!isPlainObject(item)) {
      continue;
    }

    const toolId = typeof item.toolId === 'string' ? item.toolId : undefined;
    if (!toolId) {
      continue;
    }

    const toolReference = toCamelCase(toolId);
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

function collectCanDelegateToReferences(canDelegateTo?: unknown[]): string[] {
  if (!Array.isArray(canDelegateTo)) {
    return [];
  }

  const references: string[] = [];
  for (const item of canDelegateTo) {
    if (typeof item === 'string') {
      references.push(toCamelCase(item));
      continue;
    }

    if (!isPlainObject(item)) {
      continue;
    }

    const targetId =
      typeof item.subAgentId === 'string'
        ? item.subAgentId
        : typeof item.agentId === 'string'
          ? item.agentId
          : typeof item.externalAgentId === 'string'
            ? item.externalAgentId
            : undefined;

    if (!targetId) {
      continue;
    }

    const targetReference = toCamelCase(targetId);
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

function hasReferences(references?: string[]): references is string[] {
  return Array.isArray(references) && references.length > 0;
}
