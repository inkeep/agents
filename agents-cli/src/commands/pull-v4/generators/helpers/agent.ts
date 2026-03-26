import type { SourceFile } from 'ts-morph';
import {
  addNamedImports,
  applyImportPlan,
  createImportPlan,
  type NamedImportSpec,
} from '../../import-plan';
import {
  createUniqueReferenceName,
  isPlainObject,
  toCamelCase,
  toKebabCase,
  toTriggerReferenceName,
} from '../../utils';

export type ReferenceNameMap = Map<string, string>;
export type TriggerImportMap = Map<string, { importName: string; modulePath: string }>;

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

export function addTriggerImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap,
  importRefs: TriggerImportMap
): void {
  const importPlan = createImportPlan();
  for (const [triggerId, referenceName] of referenceNames) {
    const importRef = importRefs.get(triggerId);
    if (!importRef) {
      continue;
    }

    const { importName, modulePath } = importRef;
    addNamedImports(
      importPlan,
      `./triggers/${modulePath}`,
      toNamedImport(importName, referenceName)
    );
  }
  applyImportPlan(sourceFile, importPlan);
}

export function addStatusComponentImports(
  sourceFile: SourceFile,
  referenceNames: ReferenceNameMap
): void {
  const importPlan = createImportPlan();
  for (const [statusComponentId, referenceName] of referenceNames) {
    const importName = toCamelCase(statusComponentId);
    addNamedImports(
      importPlan,
      `../status-components/${statusComponentId}`,
      toNamedImport(importName, referenceName)
    );
  }
  applyImportPlan(sourceFile, importPlan);
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

function toNamedImport(importName: string, referenceName: string): NamedImportSpec {
  return importName === referenceName ? importName : { name: importName, alias: referenceName };
}
