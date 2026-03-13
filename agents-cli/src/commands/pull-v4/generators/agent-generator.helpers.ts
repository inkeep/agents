import type { SourceFile } from 'ts-morph';
import {
  collectTemplateVariableNames,
  createUniqueReferenceName,
  isPlainObject,
  toCamelCase,
  toKebabCase,
  toTriggerReferenceName,
} from '../utils';

export type ReferenceNameMap = Map<string, string>;
export type TriggerImportMap = Map<string, { importName: string; modulePath: string }>;

interface SubAgentReferenceOverride {
  name: string;
  local?: boolean;
}

type StatusComponentLike = string | { id?: string; type?: string; name?: string };
type StatusUpdatesLike = { statusComponents?: StatusComponentLike[] } | undefined;

export function collectTemplateVariableNamesFromFields(
  values: Array<string | undefined>
): string[] {
  const variables: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    variables.push(...collectTemplateVariableNames(value));
  }
  return variables;
}

export function extractIds(value: unknown[] | Record<string, unknown>): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (isPlainObject(item) && typeof item.id === 'string') {
          return item.id;
        }
        return null;
      })
      .filter((id): id is string => Boolean(id));
  }
  return Object.keys(value);
}

export function extractContextConfigId(
  contextConfig?: string | { id?: string }
): string | undefined {
  if (!contextConfig) {
    return;
  }
  if (typeof contextConfig === 'string') {
    return contextConfig;
  }
  return contextConfig.id;
}

export function addSubAgentImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap,
  importNames: ReferenceNameMap,
  modulePathOverrides?: Record<string, string>
): void {
  for (const [subAgentId, referenceName] of referenceNames) {
    const importName = importNames.get(subAgentId);
    if (!importName) {
      continue;
    }

    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./sub-agents/${modulePathOverrides?.[subAgentId] ?? subAgentId}`,
    });
  }
}

export function addTriggerImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap,
  importRefs: TriggerImportMap
): void {
  for (const [triggerId, referenceName] of referenceNames) {
    const importRef = importRefs.get(triggerId);
    if (!importRef) {
      continue;
    }

    const { importName, modulePath } = importRef;
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./triggers/${modulePath}`,
    });
  }
}

export function addScheduledTriggerImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap,
  importRefs: TriggerImportMap
): void {
  for (const [scheduledTriggerId, referenceName] of referenceNames) {
    const importRef = importRefs.get(scheduledTriggerId);
    if (!importRef) {
      continue;
    }

    const { importName, modulePath } = importRef;
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `./scheduled-triggers/${modulePath}`,
    });
  }
}

export function extractStatusComponentIds(statusUpdates: StatusUpdatesLike): string[] {
  if (!statusUpdates?.statusComponents?.length) {
    return [];
  }

  const statusComponentIds = statusUpdates.statusComponents.map(resolveStatusComponentId);
  return [...new Set(statusComponentIds)];
}

export function resolveStatusComponentId(statusComponent: StatusComponentLike): string {
  const id =
    typeof statusComponent === 'string'
      ? statusComponent
      : statusComponent.id || statusComponent.type;
  if (!id) {
    throw new Error(
      `Unable to resolve status component with id ${JSON.stringify(statusComponent)}`
    );
  }
  return id;
}

export function addStatusComponentImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap
): void {
  for (const [statusComponentId, referenceName] of referenceNames) {
    const importName = toCamelCase(statusComponentId);
    sourceFile.addImportDeclaration({
      namedImports: [
        importName === referenceName ? importName : { name: importName, alias: referenceName },
      ],
      moduleSpecifier: `../status-components/${statusComponentId}`,
    });
  }
}

export function createSubAgentReferenceMaps(
  ids: Iterable<string>,
  reservedNames: Set<string>,
  conflictSuffix: string,
  overrides?: Record<string, SubAgentReferenceOverride>
): {
  referenceNames: ReferenceNameMap;
  importNames: ReferenceNameMap;
} {
  const referenceNames: ReferenceNameMap = new Map();
  const importNames: ReferenceNameMap = new Map();

  for (const id of ids) {
    if (referenceNames.has(id)) {
      continue;
    }

    const override = overrides?.[id];
    const importName = override?.name ?? toCamelCase(id);
    const isLocal = override?.local === true;
    const referenceName = isLocal
      ? importName
      : createUniqueReferenceName(importName, reservedNames, conflictSuffix);

    if (isLocal) {
      reservedNames.add(referenceName);
    } else {
      importNames.set(id, importName);
    }

    referenceNames.set(id, referenceName);
  }

  return { referenceNames, importNames };
}

export function createReferenceNameMap(
  ids: Iterable<string>,
  reservedNames: Set<string>,
  conflictSuffix: string
): ReferenceNameMap {
  const map: ReferenceNameMap = new Map();
  for (const id of ids) {
    if (map.has(id)) {
      continue;
    }
    map.set(id, createUniqueReferenceName(toCamelCase(id), reservedNames, conflictSuffix));
  }
  return map;
}

export function createScheduledTriggerReferenceMaps(
  scheduledTriggers: unknown,
  reservedNames: Set<string>
): {
  referenceNames: ReferenceNameMap;
  importRefs: TriggerImportMap;
} {
  const referenceNames: ReferenceNameMap = new Map();
  const importRefs: TriggerImportMap = new Map();

  if (!scheduledTriggers || !isPlainObject(scheduledTriggers)) {
    return { referenceNames, importRefs };
  }

  const moduleNameCounts = new Map<string, number>();

  for (const [scheduledTriggerId, scheduledTriggerData] of Object.entries(scheduledTriggers)) {
    if (referenceNames.has(scheduledTriggerId)) {
      continue;
    }

    const scheduledTriggerRecord = isPlainObject(scheduledTriggerData)
      ? scheduledTriggerData
      : undefined;
    const scheduledTriggerName =
      typeof scheduledTriggerRecord?.name === 'string' && scheduledTriggerRecord.name.length > 0
        ? scheduledTriggerRecord.name
        : scheduledTriggerId;

    const importName = toTriggerReferenceName(scheduledTriggerName);
    const referenceName = createNumericReferenceName(importName, reservedNames);

    const baseModuleName =
      toKebabCase(scheduledTriggerName) || toKebabCase(scheduledTriggerId) || scheduledTriggerId;
    const moduleCount = moduleNameCounts.get(baseModuleName) ?? 0;
    moduleNameCounts.set(baseModuleName, moduleCount + 1);
    const modulePath = moduleCount === 0 ? baseModuleName : `${baseModuleName}-${moduleCount}`;

    referenceNames.set(scheduledTriggerId, referenceName);
    importRefs.set(scheduledTriggerId, { importName, modulePath });
  }

  return { referenceNames, importRefs };
}

export function createTriggerReferenceMaps(
  triggers: unknown,
  reservedNames: Set<string>
): {
  referenceNames: ReferenceNameMap;
  importRefs: TriggerImportMap;
} {
  const referenceNames: ReferenceNameMap = new Map();
  const importRefs: TriggerImportMap = new Map();

  if (!triggers || !isPlainObject(triggers)) {
    return { referenceNames, importRefs };
  }

  const moduleNameCounts = new Map<string, number>();

  for (const [triggerId, triggerData] of Object.entries(triggers)) {
    if (referenceNames.has(triggerId)) {
      continue;
    }

    const triggerRecord = isPlainObject(triggerData) ? triggerData : undefined;
    const triggerName =
      typeof triggerRecord?.name === 'string' && triggerRecord.name.length > 0
        ? triggerRecord.name
        : triggerId;

    const importName = toTriggerReferenceName(triggerName);
    const referenceName = createNumericReferenceName(importName, reservedNames);

    const baseModuleName = toKebabCase(triggerName) || toKebabCase(triggerId) || triggerId;
    const moduleCount = moduleNameCounts.get(baseModuleName) ?? 0;
    moduleNameCounts.set(baseModuleName, moduleCount + 1);
    const modulePath = moduleCount === 0 ? baseModuleName : `${baseModuleName}-${moduleCount}`;

    referenceNames.set(triggerId, referenceName);
    importRefs.set(triggerId, { importName, modulePath });
  }

  return { referenceNames, importRefs };
}

function createNumericReferenceName(baseName: string, reservedNames: Set<string>): string {
  if (!reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  let index = 1;
  while (reservedNames.has(`${baseName}${index}`)) {
    index += 1;
  }

  const uniqueName = `${baseName}${index}`;
  reservedNames.add(uniqueName);
  return uniqueName;
}
