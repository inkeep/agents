import type { ObjectLiteralExpression, SourceFile, Statement } from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';
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

  return dedupeConsecutiveIdenticalSingleLineComments(existingSourceFile.getFullText().trimEnd());
}

function mergeImports(existingFile: SourceFile, generatedFile: SourceFile) {
  for (const generatedImport of generatedFile.getImportDeclarations()) {
    const moduleSpecifier = generatedImport.getModuleSpecifierValue();
    const matchingImports = existingFile
      .getImportDeclarations()
      .filter((existingImport) => existingImport.getModuleSpecifierValue() === moduleSpecifier);

    if (!matchingImports.length) {
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
  return imports.some((importDeclaration) => importDeclaration.getText() === text);
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

  appendUniqueStatement(existingFile, generatedStatement);
}

function upsertVariableStatement(existingFile: SourceFile, generatedStatement: Statement) {
  if (!Node.isVariableStatement(generatedStatement)) {
    return;
  }

  const generatedDeclarations = generatedStatement.getDeclarations();
  if (!generatedDeclarations.length) {
    appendUniqueStatement(existingFile, generatedStatement);
    return;
  }

  const existingStatements = new Set<Statement>();
  for (const generatedDeclaration of generatedDeclarations) {
    let existingDeclaration = existingFile.getVariableDeclaration(generatedDeclaration.getName());
    if (!existingDeclaration) {
      existingDeclaration = findExistingDeclarationByEntitySignature(
        existingFile,
        generatedDeclaration
      );
      if (existingDeclaration) {
        generatedDeclaration.rename(existingDeclaration.getName());
      }
    }

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
    appendUniqueStatement(existingFile, generatedStatement);
    return;
  }

  const [firstExistingStatement, ...remainingStatements] = [...existingStatements];
  if (firstExistingStatement) {
    firstExistingStatement.replaceWithText(
      buildReplacementStatementText(firstExistingStatement, generatedStatement)
    );
  }
  for (const statement of remainingStatements) {
    statement.remove();
  }
}

function findExistingDeclarationByEntitySignature(
  existingFile: SourceFile,
  generatedDeclaration: ReturnType<SourceFile['getVariableDeclarations']>[number]
) {
  const generatedSignature = getVariableDeclarationEntitySignature(generatedDeclaration);
  if (!generatedSignature) {
    return;
  }

  const matchingDeclarations = existingFile
    .getVariableDeclarations()
    .filter(
      (declaration) => getVariableDeclarationEntitySignature(declaration) === generatedSignature
    );

  if (!matchingDeclarations.length) {
    return;
  }

  const exportedDeclaration = matchingDeclarations.find((declaration) =>
    declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.hasExportKeyword()
  );

  return exportedDeclaration ?? matchingDeclarations[0];
}

function getVariableDeclarationEntitySignature(
  declaration: ReturnType<SourceFile['getVariableDeclarations']>[number]
): string | undefined {
  const initializer = declaration.getInitializer();
  if (!initializer || !Node.isCallExpression(initializer)) {
    return;
  }

  const expression = initializer.getExpression();
  if (!Node.isIdentifier(expression)) {
    return;
  }

  const args = initializer.getArguments();
  if (!args.length || !Node.isObjectLiteralExpression(args[0])) {
    return;
  }

  const factoryName = expression.getText();
  const entityId = readEntityId(args[0], factoryName);
  if (!entityId) {
    return;
  }

  return `${factoryName}:${entityId}`;
}

function readEntityId(
  configObject: ObjectLiteralExpression,
  factoryName: string
): string | undefined {
  const idProperty = configObject.getProperty('id');
  if (idProperty && Node.isPropertyAssignment(idProperty)) {
    const idInitializer = idProperty.getInitializer();
    if (idInitializer && Node.isStringLiteral(idInitializer)) {
      return idInitializer.getLiteralValue();
    }
  }

  if (factoryName === 'statusComponent') {
    const typeProperty = configObject.getProperty('type');
    if (typeProperty && Node.isPropertyAssignment(typeProperty)) {
      const typeInitializer = typeProperty.getInitializer();
      if (typeInitializer && Node.isStringLiteral(typeInitializer)) {
        return typeInitializer.getLiteralValue();
      }
    }
  }

  if (factoryName === 'functionTool') {
    const nameProperty = configObject.getProperty('name');
    if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
      const nameInitializer = nameProperty.getInitializer();
      if (nameInitializer && Node.isStringLiteral(nameInitializer)) {
        return nameInitializer.getLiteralValue();
      }
    }
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
    appendUniqueStatement(existingFile, generatedStatement);
    return;
  }

  const existingStatement = finder(existingFile, statementName);
  if (!existingStatement) {
    appendUniqueStatement(existingFile, generatedStatement);
    return;
  }

  existingStatement.replaceWithText(
    buildReplacementStatementText(existingStatement, generatedStatement)
  );
}

function appendUniqueStatement(existingFile: SourceFile, generatedStatement: Statement) {
  const statementText = generatedStatement.getText();
  const hasExistingStatement = existingFile
    .getStatements()
    .some((statement) => statement.getText() === statementText);

  if (hasExistingStatement) return;
  existingFile.addStatements([statementText]);
}

function buildReplacementStatementText(
  existingStatement: Statement,
  generatedStatement: Statement
): string {
  const orderingAlignedText = alignStatementOrdering(existingStatement, generatedStatement);
  return withPreservedLeadingComments(existingStatement, orderingAlignedText);
}

function alignStatementOrdering(
  existingStatement: Statement,
  generatedStatement: Statement
): string {
  if (Node.isVariableStatement(existingStatement) && Node.isVariableStatement(generatedStatement)) {
    return alignVariableStatementOrdering(existingStatement, generatedStatement);
  }

  return generatedStatement.getText();
}

function alignVariableStatementOrdering(
  existingStatement: ReturnType<SourceFile['getVariableStatements']>[number],
  generatedStatement: ReturnType<SourceFile['getVariableStatements']>[number]
): string {
  generatedStatement.setIsExported(existingStatement.isExported());
  const generatedText = generatedStatement.getText();
  const generatedStatementStart = generatedStatement.getStart();
  const existingDeclarationsByName = new Map(
    existingStatement.getDeclarations().map((declaration) => [declaration.getName(), declaration])
  );

  const replacements: TextReplacement[] = [];
  for (const generatedDeclaration of generatedStatement.getDeclarations()) {
    const existingDeclaration = existingDeclarationsByName.get(generatedDeclaration.getName());
    if (!existingDeclaration) {
      continue;
    }

    const generatedInitializer = generatedDeclaration.getInitializer();
    const existingInitializer = existingDeclaration.getInitializer();
    if (!generatedInitializer || !existingInitializer) {
      continue;
    }

    const alignedInitializerText = alignExpressionText(existingInitializer, generatedInitializer);
    if (alignedInitializerText === generatedInitializer.getText()) {
      continue;
    }

    replacements.push({
      start: generatedInitializer.getStart() - generatedStatementStart,
      end: generatedInitializer.getEnd() - generatedStatementStart,
      text: alignedInitializerText,
    });
  }

  return applyTextReplacements(generatedText, replacements);
}

function alignExpressionText(
  existingExpression: Node | undefined,
  generatedExpression: Node
): string {
  if (!existingExpression) {
    return generatedExpression.getText();
  }

  if (
    Node.isObjectLiteralExpression(existingExpression) &&
    Node.isObjectLiteralExpression(generatedExpression)
  ) {
    return alignObjectLiteralText(existingExpression, generatedExpression);
  }

  if (
    Node.isArrayLiteralExpression(existingExpression) &&
    Node.isArrayLiteralExpression(generatedExpression)
  ) {
    return alignArrayLiteralText(existingExpression, generatedExpression);
  }

  if (Node.isArrowFunction(existingExpression) && Node.isArrowFunction(generatedExpression)) {
    return alignArrowFunctionText(existingExpression, generatedExpression);
  }

  if (Node.isCallExpression(existingExpression) && Node.isCallExpression(generatedExpression)) {
    return alignCallExpressionText(existingExpression, generatedExpression);
  }

  if (
    Node.isParenthesizedExpression(existingExpression) &&
    Node.isParenthesizedExpression(generatedExpression)
  ) {
    const alignedInnerText = alignExpressionText(
      existingExpression.getExpression(),
      generatedExpression.getExpression()
    );
    return `(${alignedInnerText})`;
  }

  return generatedExpression.getText();
}

function alignCallExpressionText(
  existingCall: ReturnType<SourceFile['getDescendantsOfKind']>[number],
  generatedCall: ReturnType<SourceFile['getDescendantsOfKind']>[number]
): string {
  if (!Node.isCallExpression(existingCall) || !Node.isCallExpression(generatedCall)) {
    return generatedCall.getText();
  }

  const generatedText = generatedCall.getText();
  const generatedCallStart = generatedCall.getStart();
  const existingArguments = existingCall.getArguments();
  const generatedArguments = generatedCall.getArguments();
  const replacements: TextReplacement[] = [];

  for (const [index, generatedArgument] of generatedArguments.entries()) {
    const existingArgument = existingArguments[index];
    if (!existingArgument) {
      continue;
    }

    const alignedArgumentText = alignExpressionText(existingArgument, generatedArgument);
    if (alignedArgumentText === generatedArgument.getText()) {
      continue;
    }

    replacements.push({
      start: generatedArgument.getStart() - generatedCallStart,
      end: generatedArgument.getEnd() - generatedCallStart,
      text: alignedArgumentText,
    });
  }

  return applyTextReplacements(generatedText, replacements);
}

function alignArrowFunctionText(
  existingArrow: ReturnType<SourceFile['getDescendantsOfKind']>[number],
  generatedArrow: ReturnType<SourceFile['getDescendantsOfKind']>[number]
): string {
  if (!Node.isArrowFunction(existingArrow) || !Node.isArrowFunction(generatedArrow)) {
    return generatedArrow.getText();
  }

  const existingBody = existingArrow.getBody();
  const generatedBody = generatedArrow.getBody();
  if (!Node.isExpression(existingBody) || !Node.isExpression(generatedBody)) {
    return generatedArrow.getText();
  }

  const alignedBodyText = alignExpressionText(existingBody, generatedBody);
  if (alignedBodyText === generatedBody.getText()) {
    return generatedArrow.getText();
  }

  return applyTextReplacements(generatedArrow.getText(), [
    {
      start: generatedBody.getStart() - generatedArrow.getStart(),
      end: generatedBody.getEnd() - generatedArrow.getStart(),
      text: alignedBodyText,
    },
  ]);
}

function alignObjectLiteralText(
  existingObject: ObjectLiteralExpression,
  generatedObject: ObjectLiteralExpression
): string {
  const orderedProperties = orderObjectProperties(
    existingObject.getProperties(),
    generatedObject.getProperties()
  );

  const propertyTexts = orderedProperties.map(({ existingProperty, generatedProperty }) =>
    alignObjectPropertyText(existingProperty, generatedProperty)
  );

  return formatCollectionLiteralText(generatedObject.getText(), propertyTexts, '{', '}');
}

function alignObjectPropertyText(
  existingProperty: Node | undefined,
  generatedProperty: Node
): string {
  if (!Node.isPropertyAssignment(generatedProperty)) {
    return withPreservedNodeLeadingComments(existingProperty, generatedProperty.getText());
  }

  const generatedInitializer = generatedProperty.getInitializer();
  if (!generatedInitializer) {
    return withPreservedNodeLeadingComments(existingProperty, generatedProperty.getText());
  }

  const existingInitializer =
    existingProperty && Node.isPropertyAssignment(existingProperty)
      ? existingProperty.getInitializer()
      : undefined;
  const alignedInitializerText = alignExpressionText(existingInitializer, generatedInitializer);
  const propertyText =
    alignedInitializerText === generatedInitializer.getText()
      ? generatedProperty.getText()
      : `${generatedProperty.getNameNode().getText()}: ${alignedInitializerText}`;

  return withPreservedNodeLeadingComments(existingProperty, propertyText);
}

function withPreservedNodeLeadingComments(
  existingNode: Node | undefined,
  replacementText: string
): string {
  if (!existingNode) {
    return replacementText;
  }

  const leadingComments = getNodeLeadingCommentsText(existingNode);
  if (!leadingComments) {
    return replacementText;
  }

  if (replacementText.trimStart().startsWith(leadingComments.trimStart())) {
    return replacementText;
  }

  return `${leadingComments}\n${replacementText}`;
}

function getNodeLeadingCommentsText(node: Node): string | undefined {
  const commentTexts = node.getLeadingCommentRanges().map((commentRange) => commentRange.getText());

  if (!commentTexts.length) {
    return;
  }

  return [...new Set(commentTexts)].join('\n');
}

function alignArrayLiteralText(
  existingArray: ReturnType<SourceFile['getDescendantsOfKind']>[number],
  generatedArray: ReturnType<SourceFile['getDescendantsOfKind']>[number]
): string {
  if (
    !Node.isArrayLiteralExpression(existingArray) ||
    !Node.isArrayLiteralExpression(generatedArray)
  ) {
    return generatedArray.getText();
  }

  const orderedElements = orderArrayElements(
    existingArray.getElements(),
    generatedArray.getElements()
  );
  const elementTexts = orderedElements.map(({ existingElement, generatedElement }) =>
    alignExpressionText(existingElement, generatedElement)
  );

  return formatCollectionLiteralText(generatedArray.getText(), elementTexts, '[', ']');
}

function orderObjectProperties(existingProperties: Node[], generatedProperties: Node[]) {
  const generatedEntries = generatedProperties.map((generatedProperty) => ({
    generatedProperty,
    key: getObjectPropertyKey(generatedProperty),
  }));
  const usedGeneratedIndexes = new Set<number>();
  const ordered: Array<{ existingProperty?: Node; generatedProperty: Node }> = [];

  for (const existingProperty of existingProperties) {
    const existingKey = getObjectPropertyKey(existingProperty);
    if (!existingKey) {
      continue;
    }

    const generatedIndex = generatedEntries.findIndex(
      (entry, index) => !usedGeneratedIndexes.has(index) && entry.key === existingKey
    );
    if (generatedIndex === -1) {
      continue;
    }

    const generatedEntry = generatedEntries[generatedIndex];
    if (!generatedEntry) {
      continue;
    }

    usedGeneratedIndexes.add(generatedIndex);
    ordered.push({
      existingProperty,
      generatedProperty: generatedEntry.generatedProperty,
    });
  }

  for (const [index, generatedEntry] of generatedEntries.entries()) {
    if (usedGeneratedIndexes.has(index)) {
      continue;
    }
    ordered.push({ generatedProperty: generatedEntry.generatedProperty });
  }

  return ordered;
}

function orderArrayElements(existingElements: Node[], generatedElements: Node[]) {
  const generatedEntries = generatedElements.map((generatedElement) => ({
    generatedElement,
    signature: getArrayElementSignature(generatedElement),
  }));
  const usedGeneratedIndexes = new Set<number>();
  const ordered: Array<{ existingElement?: Node; generatedElement: Node }> = [];

  for (const existingElement of existingElements) {
    const existingSignature = getArrayElementSignature(existingElement);
    const generatedIndex = generatedEntries.findIndex(
      (entry, index) => !usedGeneratedIndexes.has(index) && entry.signature === existingSignature
    );
    if (generatedIndex === -1) {
      continue;
    }

    const generatedEntry = generatedEntries[generatedIndex];
    if (!generatedEntry) {
      continue;
    }

    usedGeneratedIndexes.add(generatedIndex);
    ordered.push({
      existingElement,
      generatedElement: generatedEntry.generatedElement,
    });
  }

  for (const [index, generatedEntry] of generatedEntries.entries()) {
    if (usedGeneratedIndexes.has(index)) {
      continue;
    }
    ordered.push({ generatedElement: generatedEntry.generatedElement });
  }

  return ordered;
}

function getObjectPropertyKey(property: Node): string | undefined {
  if (
    Node.isPropertyAssignment(property) ||
    Node.isShorthandPropertyAssignment(property) ||
    Node.isMethodDeclaration(property) ||
    Node.isGetAccessorDeclaration(property) ||
    Node.isSetAccessorDeclaration(property)
  ) {
    return property.getName();
  }

  if (Node.isSpreadAssignment(property)) {
    return `...${property.getExpression().getText()}`;
  }
  return;
}

function getArrayElementSignature(node: Node): string {
  if (Node.isIdentifier(node)) {
    return `id:${node.getText()}`;
  }

  if (Node.isStringLiteral(node)) {
    return `str:${node.getLiteralValue()}`;
  }

  if (Node.isObjectLiteralExpression(node)) {
    const objectId =
      readStringLiteralObjectProperty(node, 'id') ||
      readStringLiteralObjectProperty(node, 'type') ||
      readStringLiteralObjectProperty(node, 'name');
    if (objectId) {
      return `obj:${objectId}`;
    }
  }

  if (Node.isCallExpression(node)) {
    const expression = node.getExpression();
    if (Node.isPropertyAccessExpression(expression) && expression.getName() === 'with') {
      return `with:${expression.getExpression().getText()}`;
    }
  }

  return node.getText();
}

function readStringLiteralObjectProperty(
  objectLiteral: ObjectLiteralExpression,
  propertyName: string
): string | undefined {
  const property = objectLiteral.getProperty(propertyName);
  if (!property || !Node.isPropertyAssignment(property)) {
    return;
  }
  const initializer = property.getInitializer();
  if (!initializer || !Node.isStringLiteral(initializer)) {
    return;
  }

  return initializer.getLiteralValue();
}

function formatCollectionLiteralText(
  originalText: string,
  itemTexts: string[],
  openToken: '{' | '[',
  closeToken: '}' | ']'
): string {
  if (!itemTexts.length) {
    return `${openToken}${closeToken}`;
  }

  if (!originalText.includes('\n')) {
    const openingWithSpacing = originalText.startsWith(`${openToken} `)
      ? `${openToken} `
      : openToken;
    const closingWithSpacing = originalText.endsWith(` ${closeToken}`)
      ? ` ${closeToken}`
      : closeToken;

    return `${openingWithSpacing}${itemTexts.join(', ')}${closingWithSpacing}`;
  }

  const escapedOpenToken = openToken === '{' ? '\\{' : '\\[';
  const escapedCloseToken = closeToken === '}' ? '\\}' : '\\]';
  const innerIndent =
    originalText.match(new RegExp(`${escapedOpenToken}\\r?\\n([ \\t]+)\\S`))?.[1] || '  ';
  const closingIndent =
    originalText.match(new RegExp(`\\r?\\n([ \\t]*)${escapedCloseToken}\\s*$`))?.[1] || '';

  const indentedItems = itemTexts.map((itemText) => indentMultilineText(itemText, innerIndent));

  return `${openToken}\n${indentedItems.join(',\n')}\n${closingIndent}${closeToken}`;
}

function indentMultilineText(text: string, indent: string): string {
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const firstNonEmptyLine = nonEmptyLines[0];
  const stripCandidates = nonEmptyLines
    .map((line) => {
      const trimmedLine = line.trimStart();
      const lineIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
      return { lineIndent, trimmedLine };
    })
    .filter(({ lineIndent, trimmedLine }) => lineIndent > 0 && !trimmedLine.startsWith('*'))
    .map(({ lineIndent }) => lineIndent);
  const stripIndent =
    stripCandidates.length > 0
      ? Math.min(...stripCandidates)
      : (firstNonEmptyLine?.match(/^[ \t]*/)?.[0].length ?? 0);

  const normalizedLines = lines.map((line) => {
    if (!line.trim()) {
      return '';
    }
    if (stripIndent === 0) {
      return line;
    }

    const lineIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
    const trimmedLine = line.trimStart();
    if (trimmedLine.startsWith('*') && lineIndent < stripIndent) {
      return line;
    }

    return line.slice(Math.min(stripIndent, lineIndent));
  });

  return normalizedLines.map((line) => `${indent}${line}`).join('\n');
}

interface TextReplacement {
  start: number;
  end: number;
  text: string;
}

function applyTextReplacements(sourceText: string, replacements: TextReplacement[]): string {
  if (!replacements.length) {
    return sourceText;
  }

  let nextText = sourceText;
  const replacementsInDescendingOrder = [...replacements].sort((a, b) => b.start - a.start);
  for (const replacement of replacementsInDescendingOrder) {
    nextText =
      nextText.slice(0, replacement.start) + replacement.text + nextText.slice(replacement.end);
  }

  return nextText;
}

function withPreservedLeadingComments(
  existingStatement: Statement,
  replacementText: string
): string {
  const leadingComments = getLeadingCommentsText(existingStatement);
  if (!leadingComments) {
    return replacementText;
  }

  return `${leadingComments}\n${replacementText}`;
}

function getLeadingCommentsText(statement: Statement): string | undefined {
  const leadingCommentRanges = statement.getLeadingCommentRanges();
  if (!leadingCommentRanges.length) {
    return;
  }

  const commentTexts = leadingCommentRanges
    .filter(
      (commentRange) =>
        commentRange.getKind() === SyntaxKind.MultiLineCommentTrivia ||
        commentRange.getKind() === SyntaxKind.SingleLineCommentTrivia
    )
    .map((commentRange) => commentRange.getText());

  if (!commentTexts.length) {
    return;
  }

  return [...new Set(commentTexts)].join('\n');
}

function dedupeConsecutiveIdenticalSingleLineComments(content: string): string {
  const lines = content.split('\n');
  const deduped: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    const previousLine = deduped.at(-1);
    const previousTrimmedLine = previousLine?.trim();
    const isDuplicateSingleLineComment =
      trimmedLine.startsWith('//') &&
      previousTrimmedLine?.startsWith('//') &&
      trimmedLine === previousTrimmedLine;

    if (isDuplicateSingleLineComment) {
      continue;
    }

    deduped.push(line);
  }

  return deduped.join('\n');
}
