import { existsSync, readFileSync } from 'node:fs';
import type { SourceFile } from 'ts-morph';
import { createInMemoryProject } from './utils';

export interface FileScope {
  sourceFile: SourceFile;
  reservedNames: Set<string>;
}

export function createFileScope(content: string, fileName = 'scope.ts'): FileScope {
  const sourceFile = createInMemoryProject().createSourceFile(fileName, content, {
    overwrite: true,
  });

  return {
    sourceFile,
    reservedNames: collectReservedTopLevelNames(sourceFile),
  };
}

export function readFileScope(filePath: string): FileScope | undefined {
  if (!existsSync(filePath)) {
    return;
  }

  return createFileScope(readFileSync(filePath, 'utf8'), filePath);
}

export function collectReservedTopLevelNames(sourceFile: SourceFile): Set<string> {
  const reservedNames = new Set<string>();

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const defaultImport = importDeclaration.getDefaultImport()?.getText();
    if (defaultImport) {
      reservedNames.add(defaultImport);
    }

    const namespaceImport = importDeclaration.getNamespaceImport()?.getText();
    if (namespaceImport) {
      reservedNames.add(namespaceImport);
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      reservedNames.add(namedImport.getAliasNode()?.getText() ?? namedImport.getName());
    }
  }

  for (const declarations of [
    sourceFile.getVariableDeclarations(),
    sourceFile.getFunctions(),
    sourceFile.getClasses(),
    sourceFile.getInterfaces(),
    sourceFile.getTypeAliases(),
    sourceFile.getEnums(),
    sourceFile.getModules(),
  ]) {
    for (const declaration of declarations) {
      const name = declaration.getName();
      if (name) {
        reservedNames.add(name);
      }
    }
  }

  return reservedNames;
}
