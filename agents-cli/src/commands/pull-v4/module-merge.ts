import { Node, type SourceFile, type Statement, SyntaxKind } from 'ts-morph';
import { createInMemoryProject } from './utils';

export function mergeGeneratedModule(existingContent: string, generatedContent: string): string {
  const project = createInMemoryProject();

  const existingSourceFile = project.createSourceFile('existing.ts', existingContent, {
    overwrite: true,
  });
  const generatedSourceFile = project.createSourceFile('generated.ts', generatedContent, {
    overwrite: true,
  });

  mergeImports(existingSourceFile, generatedSourceFile);

  for (const statement of generatedSourceFile.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      continue;
    }
    upsertStatement(existingSourceFile, statement);
  }

  existingSourceFile.organizeImports();
  return existingSourceFile.getFullText().trimEnd();
}

function mergeImports(existingFile: SourceFile, generatedFile: SourceFile) {
  for (const generatedImport of generatedFile.getImportDeclarations()) {
    const moduleSpecifier = generatedImport.getModuleSpecifierValue();
    const matchingImports = existingFile
      .getImportDeclarations()
      .filter((existingImport) => existingImport.getModuleSpecifierValue() === moduleSpecifier);

    if (matchingImports.length === 0) {
      existingFile.addImportDeclaration(generatedImport.getStructure());
      continue;
    }

    const targetImport = findBestImportTarget(matchingImports, generatedImport);
    if (!targetImport) {
      if (!hasImportWithText(matchingImports, generatedImport.getText())) {
        existingFile.addImportDeclaration(generatedImport.getStructure());
      }
      continue;
    }

    if (!generatedImport.isTypeOnly() && targetImport.isTypeOnly()) {
      targetImport.setIsTypeOnly(false);
    }

    const generatedDefaultImport = generatedImport.getDefaultImport();
    if (generatedDefaultImport && !targetImport.getDefaultImport()) {
      targetImport.setDefaultImport(generatedDefaultImport.getText());
    }

    const generatedNamespaceImport = generatedImport.getNamespaceImport();
    if (generatedNamespaceImport && !targetImport.getNamespaceImport()) {
      targetImport.setNamespaceImport(generatedNamespaceImport.getText());
    }

    for (const generatedNamedImport of generatedImport.getNamedImports()) {
      const generatedName = generatedNamedImport.getName();
      const generatedAlias = generatedNamedImport.getAliasNode()?.getText();
      const generatedIsTypeOnly = generatedNamedImport.isTypeOnly();
      const hasNamedImport = targetImport.getNamedImports().some((existingNamedImport) => {
        return (
          existingNamedImport.getName() === generatedName &&
          existingNamedImport.getAliasNode()?.getText() === generatedAlias &&
          existingNamedImport.isTypeOnly() === generatedIsTypeOnly
        );
      });

      if (!hasNamedImport) {
        targetImport.addNamedImport({
          name: generatedName,
          alias: generatedAlias,
          isTypeOnly: generatedIsTypeOnly,
        });
      }
    }
  }
}

function findBestImportTarget(
  matchingImports: ReturnType<SourceFile['getImportDeclarations']>,
  generatedImport: ReturnType<SourceFile['getImportDeclarations']>[number]
) {
  if (generatedImport.getNamespaceImport()) {
    const namespaceText = generatedImport.getNamespaceImport()?.getText();
    return matchingImports.find(
      (importDeclaration) => importDeclaration.getNamespaceImport()?.getText() === namespaceText
    );
  }

  const nonNamespaceImport = matchingImports.find(
    (importDeclaration) => !importDeclaration.getNamespaceImport()
  );
  if (nonNamespaceImport) {
    return nonNamespaceImport;
  }

  return;
}

function hasImportWithText(imports: ReturnType<SourceFile['getImportDeclarations']>, text: string) {
  const normalized = normalizeStatementText(text);
  return imports.some(
    (importDeclaration) => normalizeStatementText(importDeclaration.getText()) === normalized
  );
}

function upsertStatement(existingFile: SourceFile, generatedStatement: Statement) {
  if (Node.isVariableStatement(generatedStatement)) {
    upsertVariableStatement(existingFile, generatedStatement);
    return;
  }

  if (Node.isFunctionDeclaration(generatedStatement)) {
    upsertNamedStatement(existingFile, generatedStatement, (sourceFile, name) =>
      sourceFile.getFunction(name)
    );
    return;
  }

  if (Node.isClassDeclaration(generatedStatement)) {
    upsertNamedStatement(existingFile, generatedStatement, (sourceFile, name) =>
      sourceFile.getClass(name)
    );
    return;
  }

  if (Node.isInterfaceDeclaration(generatedStatement)) {
    upsertNamedStatement(existingFile, generatedStatement, (sourceFile, name) =>
      sourceFile.getInterface(name)
    );
    return;
  }

  if (Node.isTypeAliasDeclaration(generatedStatement)) {
    upsertNamedStatement(existingFile, generatedStatement, (sourceFile, name) =>
      sourceFile.getTypeAlias(name)
    );
    return;
  }

  if (Node.isEnumDeclaration(generatedStatement)) {
    upsertNamedStatement(existingFile, generatedStatement, (sourceFile, name) =>
      sourceFile.getEnum(name)
    );
    return;
  }

  appendUniqueStatement(existingFile, generatedStatement.getText());
}

function upsertVariableStatement(existingFile: SourceFile, generatedStatement: Statement) {
  if (!Node.isVariableStatement(generatedStatement)) {
    return;
  }

  const declarationNames = generatedStatement
    .getDeclarations()
    .map((declaration) => declaration.getName());
  if (declarationNames.length === 0) {
    appendUniqueStatement(existingFile, generatedStatement.getText());
    return;
  }

  const existingStatements = new Set<Statement>();
  for (const declarationName of declarationNames) {
    const existingDeclaration = existingFile.getVariableDeclaration(declarationName);
    if (!existingDeclaration) {
      continue;
    }
    const existingStatement = existingDeclaration.getFirstAncestorByKind(
      SyntaxKind.VariableStatement
    );
    if (existingStatement) {
      existingStatements.add(existingStatement);
    }
  }

  if (!existingStatements.size) {
    appendUniqueStatement(existingFile, generatedStatement.getText());
    return;
  }

  const [firstExistingStatement, ...remainingStatements] = [...existingStatements];
  firstExistingStatement?.replaceWithText(generatedStatement.getText());
  for (const statement of remainingStatements) {
    statement.remove();
  }
}

function upsertNamedStatement(
  existingFile: SourceFile,
  generatedStatement: Statement,
  finder: (sourceFile: SourceFile, name: string) => Statement | undefined
) {
  const statementName =
    Node.isFunctionDeclaration(generatedStatement) ||
    Node.isClassDeclaration(generatedStatement) ||
    Node.isInterfaceDeclaration(generatedStatement) ||
    Node.isTypeAliasDeclaration(generatedStatement) ||
    Node.isEnumDeclaration(generatedStatement)
      ? generatedStatement.getName()
      : undefined;

  if (!statementName) {
    appendUniqueStatement(existingFile, generatedStatement.getText());
    return;
  }

  const existingStatement = finder(existingFile, statementName);
  if (!existingStatement) {
    appendUniqueStatement(existingFile, generatedStatement.getText());
    return;
  }

  existingStatement.replaceWithText(generatedStatement.getText());
}

function appendUniqueStatement(existingFile: SourceFile, statementText: string) {
  const normalizedIncoming = normalizeStatementText(statementText);
  const hasExistingStatement = existingFile
    .getStatements()
    .some((statement) => normalizeStatementText(statement.getText()) === normalizedIncoming);

  if (!hasExistingStatement) {
    existingFile.addStatements([statementText]);
  }
}

function normalizeStatementText(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ');
}
