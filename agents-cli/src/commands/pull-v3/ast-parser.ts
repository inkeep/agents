/**
 * AST-based Component Parser - Uses TypeScript AST + Dynamic SDK Discovery
 * 
 * This replaces regex-based parsing with:
 * 1. Dynamic SDK pattern discovery
 * 2. Proper TypeScript AST analysis  
 * 3. Automatic support for new SDK patterns
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import chalk from 'chalk';
import { Project, SyntaxKind, Node, CallExpression, VariableStatement, ImportDeclaration } from 'ts-morph';
import { discoverSDKPatterns, type SDKFunction } from './sdk-discovery';

export interface ComponentMatch {
  id: string;
  type: string; // ComponentType
  filePath: string;
  variableName?: string; // If exported
  startLine: number;
  isInline: boolean; // true if not exported, false if exported
  functionName: string; // e.g., 'mcpTool', 'envSettings.getEnvironmentMcp'
  category: 'static' | 'environment-aware' | 'utility';
  parameters: any; // The actual parameters passed to the function
}

export interface ImportedSymbol {
  name: string; // 'envSettings', 'mcpTool'
  source: string; // '@inkeep/agents-sdk'
  isNamespaceImport?: boolean; // import * as sdk
  isDefaultImport?: boolean; // import sdk
}

/**
 * Parse components from TypeScript files using AST + dynamic SDK discovery
 */
export async function parseProjectWithAST(projectRoot: string): Promise<ComponentMatch[]> {
  console.log(chalk.cyan('🔍 Starting dynamic AST-based parsing...'));
  
  // Step 1: Discover SDK patterns dynamically
  const sdkPatterns = await discoverSDKPatterns();
  
  // Step 2: Create ts-morph project for AST analysis
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      declaration: false,
      emitDeclarationOnly: false,
    }
  });
  
  // Step 3: Find and add all TypeScript files
  const tsFiles = await findTsFiles(projectRoot);
  console.log(chalk.gray(`Found ${tsFiles.length} TypeScript files to analyze`));
  
  for (const filePath of tsFiles) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not parse ${filePath}: ${error}`));
    }
  }
  
  // Step 4: Analyze each source file
  const allComponents: ComponentMatch[] = [];
  const sourceFiles = project.getSourceFiles();
  
  for (const sourceFile of sourceFiles) {
    // First, analyze imports to find SDK-related imports
    const importedSymbols = analyzeImports(sourceFile);
    
    // Then analyze components using both direct SDK patterns and imported symbols
    const components = analyzeSourceFile(sourceFile, projectRoot, sdkPatterns, importedSymbols);
    allComponents.push(...components);
    
    if (components.length > 0) {
      const relativePath = relative(projectRoot, sourceFile.getFilePath());
      console.log(chalk.gray(`  ${relativePath}: ${components.length} components`));
    }
  }
  
  console.log(chalk.green(`✅ Found ${allComponents.length} components using dynamic AST parsing`));
  return allComponents;
}

/**
 * Analyze imports to find SDK-related symbols
 */
function analyzeImports(sourceFile: any): ImportedSymbol[] {
  const importedSymbols: ImportedSymbol[] = [];
  const importDeclarations = sourceFile.getImportDeclarations();
  
  for (const importDecl of importDeclarations) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    
    // Only look at imports from SDK packages
    if (!moduleSpecifier.includes('@inkeep/agents-sdk') && !moduleSpecifier.includes('@inkeep/agents-core')) {
      continue;
    }
    
    // Handle named imports: import { envSettings, mcpTool } from '@inkeep/agents-sdk'
    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      importedSymbols.push({
        name: namedImport.getName(),
        source: moduleSpecifier,
      });
    }
    
    // Handle namespace imports: import * as sdk from '@inkeep/agents-sdk'
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      importedSymbols.push({
        name: namespaceImport.getName(),
        source: moduleSpecifier,
        isNamespaceImport: true,
      });
    }
    
    // Handle default imports: import sdk from '@inkeep/agents-sdk'
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      importedSymbols.push({
        name: defaultImport.getName(),
        source: moduleSpecifier,
        isDefaultImport: true,
      });
    }
  }
  
  return importedSymbols;
}

/**
 * Analyze a single source file for component patterns
 */
function analyzeSourceFile(
  sourceFile: any, 
  projectRoot: string, 
  sdkPatterns: Map<string, SDKFunction>,
  importedSymbols: ImportedSymbol[]
): ComponentMatch[] {
  const components: ComponentMatch[] = [];
  const filePath = relative(projectRoot, sourceFile.getFilePath());
  
  // Find all variable statements (const x = ..., export const x = ...)
  const variableStatements = sourceFile.getChildrenOfKind(SyntaxKind.VariableStatement);
  
  for (const statement of variableStatements) {
    const statementComponents = analyzeVariableStatement(statement, filePath, sdkPatterns, importedSymbols);
    components.push(...statementComponents);
  }
  
  // Also check for inline calls (not assigned to variables)
  const expressionStatements = sourceFile.getChildrenOfKind(SyntaxKind.ExpressionStatement);
  
  for (const statement of expressionStatements) {
    const expression = statement.getExpression();
    if (Node.isCallExpression(expression)) {
      const component = analyzeCallExpression(expression, filePath, true, sdkPatterns, importedSymbols); // isInline = true
      if (component) {
        components.push(component);
      }
    }
  }
  
  return components;
}

/**
 * Analyze a variable statement: const x = mcpTool(...) or export const x = ...
 */
function analyzeVariableStatement(
  statement: VariableStatement, 
  filePath: string, 
  sdkPatterns: Map<string, SDKFunction>,
  importedSymbols: ImportedSymbol[]
): ComponentMatch[] {
  const components: ComponentMatch[] = [];
  const isExported = statement.hasExportKeyword();
  
  // Get variable declarations
  const declarations = statement.getDeclarationList().getDeclarations();
  
  for (const declaration of declarations) {
    const name = declaration.getName();
    const initializer = declaration.getInitializer();
    
    if (Node.isCallExpression(initializer)) {
      const component = analyzeCallExpression(initializer, filePath, !isExported, sdkPatterns, importedSymbols, name);
      if (component) {
        components.push(component);
      }
      
      // Deep traversal: Look for nested SDK function calls within this call expression
      const nestedComponents = findNestedSDKCalls(initializer, filePath, sdkPatterns, importedSymbols);
      components.push(...nestedComponents);
    }
  }
  
  return components;
}

/**
 * Analyze a call expression using dynamic SDK patterns
 */
function analyzeCallExpression(
  callExpr: CallExpression, 
  filePath: string, 
  isInline: boolean,
  sdkPatterns: Map<string, SDKFunction>,
  importedSymbols: ImportedSymbol[],
  variableName?: string
): ComponentMatch | null {
  const functionName = getFunctionName(callExpr);
  let sdkFunction = sdkPatterns.get(functionName);
  
  // If not found in discovered patterns, check for property access patterns
  if (!sdkFunction && functionName.includes('.')) {
    sdkFunction = analyzePropertyAccessPattern(functionName, callExpr) || undefined;
  }
  
  if (!sdkFunction || !sdkFunction.componentType) {
    return null; // Not a recognized SDK function that creates components
  }
  
  // Extract component ID from the parameters
  const args = callExpr.getArguments();
  const componentId = extractComponentId(args[0], sdkFunction);
  
  if (!componentId) {
    return null; // Could not determine component ID
  }
  
  const startLine = callExpr.getStartLineNumber();
  
  return {
    id: componentId,
    type: sdkFunction.componentType,
    filePath,
    variableName,
    startLine,
    isInline,
    functionName,
    category: sdkFunction.category,
    parameters: extractParameters(args[0])
  };
}

/**
 * Get the function name from a call expression
 * Handles: mcpTool(), envSettings.getEnvironmentMcp(), etc.
 */
function getFunctionName(callExpr: CallExpression): string {
  const expression = callExpr.getExpression();
  
  if (Node.isIdentifier(expression)) {
    // Simple call: mcpTool()
    return expression.getText();
  } else if (Node.isPropertyAccessExpression(expression)) {
    // Property access: envSettings.getEnvironmentMcp()
    return expression.getText();
  }
  
  return expression.getText();
}

/**
 * Analyze property access patterns like someVariable.getEnvironmentMcp()
 */
function analyzePropertyAccessPattern(functionName: string, callExpr: CallExpression): SDKFunction | null {
  // Environment-aware patterns that need mapping (property access patterns)
  const ENVIRONMENT_PATTERNS = {
    'getEnvironmentMcp': { componentType: 'mcpTool', category: 'environment-aware' },
    'getCredential': { componentType: 'credential', category: 'environment-aware' },
    'getEnvironmentCredential': { componentType: 'credential', category: 'environment-aware' }
  };
  
  // Extract method name from property access: someVar.getEnvironmentMcp -> 'getEnvironmentMcp'
  const parts = functionName.split('.');
  const methodName = parts[parts.length - 1];
  
  const pattern = ENVIRONMENT_PATTERNS[methodName as keyof typeof ENVIRONMENT_PATTERNS];
  if (pattern) {
    return {
      name: functionName,
      category: pattern.category as 'static' | 'environment-aware' | 'utility',
      componentType: pattern.componentType, // Now maps to SDK function names
      parameters: []
    };
  }
  
  return null;
}

/**
 * Deep traversal to find nested SDK function calls within expressions
 * Focus on patterns like:
 * - agent({ tools: [mcpTool({...}), functionTool({...})] })  
 * - subAgent({ canUse: () => [tool1, tool2] })
 * - Any nested SDK function calls with parameters
 */
function findNestedSDKCalls(
  node: Node,
  filePath: string,
  sdkPatterns: Map<string, SDKFunction>,
  importedSymbols: ImportedSymbol[]
): ComponentMatch[] {
  const nestedComponents: ComponentMatch[] = [];
  
  // Recursively traverse all child nodes looking for call expressions
  node.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const functionName = getFunctionName(child);
      
      // Check if this is a recognized SDK function call
      const sdkFunction = sdkPatterns.get(functionName) || 
                         analyzePropertyAccessPattern(functionName, child);
      
      if (sdkFunction && sdkFunction.componentType) {
        // Extract component ID from the parameters
        const args = child.getArguments();
        const componentId = extractComponentId(args[0], sdkFunction);
        
        if (componentId) {
          nestedComponents.push({
            id: componentId,
            type: sdkFunction.componentType,
            filePath,
            startLine: child.getStartLineNumber(),
            isInline: true, // All nested calls are inline
            functionName,
            category: sdkFunction.category,
            parameters: extractParameters(args[0])
          });
        }
      }
    }
  });
  
  return nestedComponents;
}

/**
 * Extract component ID based on SDK function pattern
 */
function extractComponentId(firstArg: Node | undefined, sdkFunction: SDKFunction): string | null {
  if (!firstArg) return null;
  
  if (sdkFunction.category === 'environment-aware') {
    // For environment-aware functions like envSettings.getEnvironmentMcp('key')
    // The ID is typically the string parameter
    if (Node.isStringLiteral(firstArg)) {
      return firstArg.getLiteralValue();
    }
  } else {
    // For most SDK functions, ID is in the first parameter object: { id: 'component-id' }
    if (Node.isObjectLiteralExpression(firstArg)) {
      const idProperty = firstArg.getProperty('id');
      if (idProperty && Node.isPropertyAssignment(idProperty)) {
        const value = idProperty.getInitializer();
        if (value && Node.isStringLiteral(value)) {
          return value.getLiteralValue();
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract parameters for later use in generation
 */
function extractParameters(firstArg: Node | undefined): any {
  if (!firstArg) return null;
  
  // For now, return the raw text
  // Later we could parse this into structured objects
  return firstArg.getText();
}

/**
 * Find all TypeScript files in a project
 */
async function findTsFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  
  function scanDirectory(dir: string) {
    try {
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        
        // Skip common directories we don't need to scan
        if ([
          'node_modules', 
          'dist', 
          'build', 
          '.git', 
          '.next', 
          '.turbo',
          'coverage'
        ].includes(entry) || entry.startsWith('.temp-validation')) {
          continue;
        }
        
        if (!existsSync(fullPath)) continue;
        
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  scanDirectory(projectRoot);
  return files;
}