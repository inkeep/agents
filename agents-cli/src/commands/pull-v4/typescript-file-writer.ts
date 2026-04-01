import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { mergeGeneratedModule } from './module-merge';
import { createInMemoryProject } from './utils';

export function writeTypeScriptFile(
  filePath: string,
  content: string,
  writeMode: 'merge' | 'overwrite'
): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const processedContent =
    writeMode === 'merge' && existsSync(filePath)
      ? mergeSafely(readFileSync(filePath, 'utf8'), content)
      : content;

  const sourceFile = createInMemoryProject().createSourceFile('generated.ts', processedContent, {
    overwrite: true,
  });

  const normalizedSourceFile = moveVariableDeclarationsBeforeUsage(
    applyObjectShorthand(sourceFile)
  );
  sourceFile.formatText();
  writeFileSync(filePath, `${normalizedSourceFile.getFullText().trimEnd()}\n`);
}

function mergeSafely(existingContent: string, generatedContent: string): string {
  try {
    return mergeGeneratedModule(existingContent, generatedContent);
  } catch (error) {
    console.warn(
      `Warning: Failed to merge file, using generated content. Manual changes may be lost. Reason: ${error instanceof Error ? error.message : String(error)}`
    );
    return generatedContent;
  }
}

function applyObjectShorthand(sourceFile: SourceFile): SourceFile {
  for (const objectLiteral of sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const property of objectLiteral.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        continue;
      }
      const nameNode = property.getNameNode();
      const initializer = property.getInitializer();
      if (!Node.isIdentifier(nameNode) || !initializer || !Node.isIdentifier(initializer)) {
        continue;
      }
      if (nameNode.getText() !== initializer.getText()) {
        continue;
      }
      property.replaceWithText(nameNode.getText());
    }
  }
  return sourceFile;
}

function moveVariableDeclarationsBeforeUsage(sourceFile: SourceFile): SourceFile {
  let moved = true;
  while (moved) {
    moved = false;
    const variableStatements = sourceFile.getVariableStatements();
    for (const variableStatement of variableStatements) {
      const statementStart = variableStatement.getStart();
      const sourceStatements = sourceFile.getStatements();
      const statementIndex = sourceStatements.indexOf(variableStatement);
      if (statementIndex <= 0) {
        continue;
      }

      let targetIndex: number | undefined;
      for (const declaration of variableStatement.getDeclarations()) {
        for (const referenceNode of declaration.findReferencesAsNodes()) {
          if (referenceNode.getSourceFile() !== sourceFile) {
            continue;
          }

          const parentNode = referenceNode.getParent();
          if (parentNode === declaration) {
            continue;
          }

          if (referenceNode.getStart() >= statementStart) {
            continue;
          }

          if (isReferenceInsideFunctionLike(referenceNode)) {
            continue;
          }
          // @ts-expect-error
          const topLevelStatement = referenceNode.getFirstAncestor((ancestor) => {
            return Node.isStatement(ancestor) && ancestor.getParentIfKind(SyntaxKind.SourceFile);
          });
          if (!topLevelStatement) {
            continue;
          }
          // @ts-expect-error
          const topLevelStatementIndex = sourceStatements.indexOf(topLevelStatement);
          if (topLevelStatementIndex === -1 || topLevelStatementIndex >= statementIndex) {
            continue;
          }

          targetIndex =
            targetIndex === undefined
              ? topLevelStatementIndex
              : Math.min(targetIndex, topLevelStatementIndex);
        }
      }

      if (targetIndex === undefined) {
        continue;
      }

      const statementText = variableStatement.getText();
      variableStatement.remove();
      sourceFile.insertStatements(targetIndex, [statementText]);
      moved = true;
      break;
    }
  }
  return sourceFile;
}

function isReferenceInsideFunctionLike(referenceNode: Node): boolean {
  const ancestor = referenceNode.getFirstAncestor(
    (ancestor) =>
      Node.isArrowFunction(ancestor) ||
      Node.isFunctionDeclaration(ancestor) ||
      Node.isFunctionExpression(ancestor) ||
      Node.isMethodDeclaration(ancestor) ||
      Node.isGetAccessorDeclaration(ancestor) ||
      Node.isSetAccessorDeclaration(ancestor)
  );

  return Boolean(ancestor);
}
