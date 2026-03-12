import type { SourceFile } from 'ts-morph';

export type NamedImportSpec = string | { name: string; alias: string };

export interface ImportSpec {
  moduleSpecifier: string;
  namedImports: NamedImportSpec[];
}

export type ImportPlan = ImportSpec[];

export function createImportPlan(): ImportPlan {
  return [];
}

export function addNamedImports(
  plan: ImportPlan,
  moduleSpecifier: string,
  namedImports: NamedImportSpec | NamedImportSpec[]
): ImportPlan {
  const normalizedNamedImports = Array.isArray(namedImports) ? namedImports : [namedImports];
  if (!normalizedNamedImports.length) {
    return plan;
  }

  let importSpec = plan.find((entry) => entry.moduleSpecifier === moduleSpecifier);
  if (!importSpec) {
    importSpec = {
      moduleSpecifier,
      namedImports: [],
    };
    plan.push(importSpec);
  }

  const existingImportKeys = new Set(importSpec.namedImports.map(toNamedImportKey));
  for (const namedImport of normalizedNamedImports) {
    const importKey = toNamedImportKey(namedImport);
    if (existingImportKeys.has(importKey)) {
      continue;
    }

    importSpec.namedImports.push(namedImport);
    existingImportKeys.add(importKey);
  }

  return plan;
}

export function applyImportPlan(sourceFile: SourceFile, importPlan: ImportPlan): void {
  for (const importSpec of importPlan) {
    if (!importSpec.namedImports.length) {
      continue;
    }

    sourceFile.addImportDeclaration({
      namedImports: importSpec.namedImports,
      moduleSpecifier: importSpec.moduleSpecifier,
    });
  }
}

function toNamedImportKey(namedImport: NamedImportSpec): string {
  return typeof namedImport === 'string' ? namedImport : `${namedImport.name}:${namedImport.alias}`;
}
