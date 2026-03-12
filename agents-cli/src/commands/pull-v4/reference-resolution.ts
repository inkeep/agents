import type { SourceFile } from 'ts-morph';
import {
  buildComponentFileName,
  createUniqueReferenceName,
  resolveNonCollidingName,
  toCamelCase,
} from './utils';

export type CollisionStrategy = 'descriptive' | 'numeric' | 'numeric-for-duplicates';

export interface NamedReferenceOverride {
  name: string;
  local?: boolean;
}

export type ReferenceOverride = string | NamedReferenceOverride;

export interface ReferenceResolutionInput {
  id: string;
  importName: string;
  modulePath: string;
  local?: boolean;
  conflictSuffix?: string;
  collisionStrategy?: CollisionStrategy;
}

export interface ResolvedReferenceBinding {
  id: string;
  importName: string;
  localName: string;
  modulePath: string;
  isLocal: boolean;
  namedImport?: string | { name: string; alias: string };
}

export function resolveReferenceBinding(
  input: ReferenceResolutionInput,
  options: {
    reservedNames: Set<string>;
    conflictSuffix?: string;
    collisionStrategy?: CollisionStrategy;
  }
): ResolvedReferenceBinding {
  const [binding] = resolveReferenceBindings([input], options);
  if (!binding) {
    throw new Error(`Failed to resolve reference binding for ${input.id}`);
  }
  return binding;
}

export function resolveReferenceBindings(
  inputs: Iterable<ReferenceResolutionInput>,
  options: {
    reservedNames: Set<string>;
    conflictSuffix?: string;
    collisionStrategy?: CollisionStrategy;
  }
): ResolvedReferenceBinding[] {
  const dedupedInputs = dedupeReferenceInputs(inputs);
  const importNameCounts = new Map<string, number>();

  for (const input of dedupedInputs) {
    importNameCounts.set(input.importName, (importNameCounts.get(input.importName) ?? 0) + 1);
  }

  return dedupedInputs.map((input) => {
    if (input.local) {
      options.reservedNames.add(input.importName);
      return {
        id: input.id,
        importName: input.importName,
        localName: input.importName,
        modulePath: normalizeModulePath(input.modulePath),
        isLocal: true,
      };
    }

    const collisionStrategy = input.collisionStrategy ?? options.collisionStrategy ?? 'descriptive';
    const shouldUseNumeric =
      collisionStrategy === 'numeric' ||
      (collisionStrategy === 'numeric-for-duplicates' &&
        (importNameCounts.get(input.importName) ?? 0) > 1);
    const conflictSuffix = input.conflictSuffix ?? options.conflictSuffix ?? 'Reference';
    const localName = shouldUseNumeric
      ? resolveNonCollidingName(input.importName, options.reservedNames)
      : createUniqueReferenceName(input.importName, options.reservedNames, conflictSuffix);

    return {
      id: input.id,
      importName: input.importName,
      localName,
      modulePath: normalizeModulePath(input.modulePath),
      isLocal: false,
      namedImport:
        input.importName === localName
          ? input.importName
          : { name: input.importName, alias: localName },
    };
  });
}

export function resolveReferenceBindingsFromIds(options: {
  ids: Iterable<string>;
  reservedNames: Set<string>;
  conflictSuffix: string;
  collisionStrategy?: CollisionStrategy;
  referenceOverrides?: Record<string, ReferenceOverride>;
  referencePathOverrides?: Record<string, string>;
  defaultImportName?: (id: string) => string;
  defaultModulePath?: (id: string) => string;
}): ResolvedReferenceBinding[] {
  const defaultImportName = options.defaultImportName ?? toCamelCase;
  const defaultModulePath =
    options.defaultModulePath ?? ((id: string) => buildComponentFileName(id));

  const inputs: ReferenceResolutionInput[] = [];
  const seenIds = new Set<string>();
  for (const id of options.ids) {
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);

    const referenceOverride = options.referenceOverrides?.[id];
    const importName =
      typeof referenceOverride === 'string'
        ? referenceOverride
        : (referenceOverride?.name ?? defaultImportName(id));
    const modulePath = options.referencePathOverrides?.[id] ?? defaultModulePath(id);

    inputs.push({
      id,
      importName,
      modulePath,
      local: typeof referenceOverride === 'object' && referenceOverride?.local === true,
      conflictSuffix: options.conflictSuffix,
      collisionStrategy: options.collisionStrategy,
    });
  }

  return resolveReferenceBindings(inputs, {
    reservedNames: options.reservedNames,
    conflictSuffix: options.conflictSuffix,
    collisionStrategy: options.collisionStrategy,
  });
}

export function addResolvedReferenceImports(
  sourceFile: SourceFile,
  references: Iterable<ResolvedReferenceBinding>,
  resolveModuleSpecifier: (reference: ResolvedReferenceBinding) => string
): void {
  const namedImportsByModuleSpecifier = new Map<
    string,
    Array<string | { name: string; alias: string }>
  >();

  for (const reference of references) {
    if (!reference.namedImport) {
      continue;
    }

    const moduleSpecifier = resolveModuleSpecifier(reference);
    const namedImports = namedImportsByModuleSpecifier.get(moduleSpecifier) ?? [];
    namedImports.push(reference.namedImport);
    namedImportsByModuleSpecifier.set(moduleSpecifier, namedImports);
  }

  for (const [moduleSpecifier, namedImports] of namedImportsByModuleSpecifier) {
    sourceFile.addImportDeclaration({
      namedImports,
      moduleSpecifier,
    });
  }
}

export function toReferenceNameMap(
  references: Iterable<ResolvedReferenceBinding>
): Map<string, string> {
  return new Map(
    [...references].map((reference) => {
      return [reference.id, reference.localName];
    })
  );
}

export function toReferenceNameRecord(
  references: Iterable<ResolvedReferenceBinding>
): Record<string, string> {
  return Object.fromEntries(
    [...references].map((reference) => {
      return [reference.id, reference.localName];
    })
  );
}

export function toReferenceNames(references: Iterable<ResolvedReferenceBinding>): string[] {
  return [...references].map((reference) => reference.localName);
}

function dedupeReferenceInputs(
  inputs: Iterable<ReferenceResolutionInput>
): ReferenceResolutionInput[] {
  const dedupedInputs: ReferenceResolutionInput[] = [];
  const seenIds = new Set<string>();

  for (const input of inputs) {
    if (seenIds.has(input.id)) {
      continue;
    }
    seenIds.add(input.id);
    dedupedInputs.push(input);
  }

  return dedupedInputs;
}

function normalizeModulePath(modulePath: string): string {
  return modulePath.replace(/\.[^.]+$/, '');
}
