/**
 * Component Parser - Find all component definitions (exported and inline)
 * Uses AST parsing to handle complex components including those with render attributes
 * Maps components by looking for patterns like:
 * - export const myTool = tool({id: 'tool-id', ...})
 * - dataComponent({id: 'data-id', ...}) (inline)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import chalk from 'chalk';
import { type CallExpression, Node, type ObjectLiteralExpression, Project } from 'ts-morph';
import { ComponentRegistry, type ComponentType } from './utils/component-registry';

interface ComponentMatch {
  id: string;
  type: ComponentType;
  filePath: string;
  variableName?: string; // If exported
  startLine: number;
  isInline: boolean; // true if not exported, false if exported
  overrideExisting?: boolean; // true if this should override an existing component
}

/**
 * Valid plural component types for parsing
 */
const VALID_COMPONENT_TYPES = new Set<ComponentType>([
  'project',
  'agents',
  'subAgents',
  'tools',
  'functionTools',
  'dataComponents',
  'artifactComponents',
  'statusComponents',
  'externalAgents',
  'credentials',
  'contextConfigs',
  'fetchDefinitions',
  'headers',
]);

/**
 * Mapping from SDK function names to ComponentTypes
 */
const FUNCTION_NAME_TO_TYPE: Record<string, ComponentType> = {
  project: 'project',
  agent: 'agents',
  subAgent: 'subAgents',
  tool: 'tools',
  functionTool: 'functionTools',
  dataComponent: 'dataComponents',
  artifactComponent: 'artifactComponents',
  statusComponent: 'statusComponents',
  externalAgent: 'externalAgents',
  credential: 'credentials',
  contextConfig: 'contextConfigs',
  fetchDefinition: 'fetchDefinitions',
  header: 'headers',
  mcpTool: 'tools',
};

/**
 * Parse a single file for all component definitions using AST parsing
 * Handles all patterns: exported, declared+exported, declared-only, and inline
 */
function parseFileForComponents(
  filePath: string,
  projectRoot: string,
  debug: boolean = false
): ComponentMatch[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const components: ComponentMatch[] = [];
  const relativePath = relative(projectRoot, filePath);

  try {
    const content = readFileSync(filePath, 'utf8');

    // Create a temporary ts-morph project for parsing
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        target: 99, // Latest
        jsx: 1, // Preserve JSX
      },
    });

    // Add the file to the project
    const sourceFile = project.createSourceFile('temp.ts', content);

    // Pattern 1: Direct exports (export const name = func({...}))
    const exportedVariableDeclarations = sourceFile
      .getVariableStatements()
      .filter((statement) => statement.hasExportKeyword())
      .flatMap((statement) => statement.getDeclarationList().getDeclarations());

    for (const declaration of exportedVariableDeclarations) {
      const variableName = declaration.getName();
      const initializer = declaration.getInitializer();

      if (Node.isCallExpression(initializer)) {
        const componentMatch = parseCallExpression(initializer, variableName, false, relativePath);
        if (componentMatch) {
          components.push(componentMatch);
        }
      }
    }

    // Pattern 2: Separate declaration + export (const name = func({...}) + export { name })
    // First, collect all exported names from export declarations
    const exportedNames = new Set<string>();
    sourceFile.getExportDeclarations().forEach((exportDecl) => {
      const namedExports = exportDecl.getNamedExports();
      namedExports.forEach((namedExport) => {
        exportedNames.add(namedExport.getName());
      });
    });

    // Find variable declarations that are exported via separate export statements
    const allVariableDeclarations = sourceFile
      .getVariableStatements()
      .filter((statement) => !statement.hasExportKeyword()) // Not direct exports
      .flatMap((statement) => statement.getDeclarationList().getDeclarations());

    for (const declaration of allVariableDeclarations) {
      const variableName = declaration.getName();
      const initializer = declaration.getInitializer();

      if (Node.isCallExpression(initializer)) {
        const isExported = exportedNames.has(variableName);
        const isInline = !isExported;

        const componentMatch = parseCallExpression(
          initializer,
          variableName,
          isInline,
          relativePath
        );
        if (componentMatch) {
          components.push(componentMatch);
        }
      }
    }

    // Pattern 3: Truly inline components (function calls without variable assignment)
    // Walk the AST to find all call expressions that aren't part of variable declarations
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        // Check if this call expression is NOT the initializer of a variable declaration
        const parent = node.getParent();
        const isVariableInitializer =
          Node.isVariableDeclaration(parent) && parent.getInitializer() === node;

        if (!isVariableInitializer) {
          const componentMatch = parseCallExpression(node, undefined, true, relativePath);
          if (componentMatch) {
            components.push(componentMatch);
          }
        }
      }
    });

    // Pattern 4: Environment-based credentials within registerEnvironmentSettings
    // export const development = registerEnvironmentSettings({
    //   credentials: {
    //     stripe_api_key: {
    //       id: 'stripe-api-key',
    //       name: 'Stripe API Key',
    //       ...
    //     }
    //   }
    // });
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        
        // Check if this is a registerEnvironmentSettings call
        if (Node.isIdentifier(expression) && expression.getText() === 'registerEnvironmentSettings') {
          const args = node.getArguments();
          if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
            const configObject = args[0];
            
            // Look for credentials property
            const credentialsProperty = configObject.getProperty('credentials');
            if (credentialsProperty && Node.isPropertyAssignment(credentialsProperty)) {
              const credentialsValue = credentialsProperty.getInitializer();
              
              if (Node.isObjectLiteralExpression(credentialsValue)) {
                // Parse each credential in the credentials object
                credentialsValue.getProperties().forEach(property => {
                  if (Node.isPropertyAssignment(property)) {
                    const credentialKey = property.getName(); // e.g., "stripe_api_key"
                    const credentialConfig = property.getInitializer();
                    
                    if (Node.isObjectLiteralExpression(credentialConfig)) {
                      // Inline credential definition - Look for the 'id' property in the credential config
                      const idProperty = credentialConfig.getProperty('id');
                      if (idProperty && Node.isPropertyAssignment(idProperty)) {
                        const idValue = idProperty.getInitializer();
                        if (Node.isStringLiteral(idValue)) {
                          const credentialId = idValue.getLiteralValue(); // e.g., "stripe-api-key"
                          const startLine = node.getStartLineNumber();
                          
                          components.push({
                            id: credentialId,
                            type: 'credentials',
                            filePath: relativePath,
                            variableName: credentialKey, // Use the key name as variable name
                            startLine,
                            isInline: true, // It's nested within environment settings
                          });
                        }
                      }
                    } else if (Node.isIdentifier(credentialConfig)) {
                      // Variable reference - need to find the credential ID from the variable
                      // This handles cases like: stripe_api_key: stripeApiKey
                      const variableName = credentialConfig.getText();
                      
                      // Look for the credential variable definition in this file
                      sourceFile.forEachDescendant((varNode) => {
                        if (Node.isVariableDeclaration(varNode) && varNode.getName() === variableName) {
                          const initializer = varNode.getInitializer();
                          if (Node.isCallExpression(initializer)) {
                            const callExpression = initializer.getExpression();
                            if (Node.isIdentifier(callExpression) && callExpression.getText() === 'credential') {
                              const args = initializer.getArguments();
                              if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
                                const configObject = args[0];
                                const idProperty = configObject.getProperty('id');
                                if (idProperty && Node.isPropertyAssignment(idProperty)) {
                                  const idValue = idProperty.getInitializer();
                                  if (Node.isStringLiteral(idValue)) {
                                    const credentialId = idValue.getLiteralValue();
                                    const startLine = node.getStartLineNumber();
                                    
                                    components.push({
                                      id: credentialId,
                                      type: 'credentials',
                                      filePath: relativePath,
                                      variableName: credentialKey, // Use the env settings key as variable name
                                      startLine,
                                      isInline: true,
                                      overrideExisting: true, // Mark this to override any existing registration
                                    });
                                  }
                                }
                              }
                            }
                          }
                        }
                      });
                    }
                  }
                });
              }
            }
          }
        }
      }
    });


    return components;
  } catch (error) {
    if (debug) {
      console.warn(`Failed to parse file ${relativePath}: ${error}`);
    }
    return [];
  }
}

/**
 * Parse a call expression to extract component information
 * Handles the same logic as the original regex patterns
 */
function parseCallExpression(
  callExpression: CallExpression,
  variableName: string | undefined,
  isInline: boolean,
  relativePath: string
): ComponentMatch | null {
  const expression = callExpression.getExpression();

  // Get the function name (e.g., 'dataComponent', 'tool', etc.)
  let functionName: string;
  if (Node.isIdentifier(expression)) {
    functionName = expression.getText();
  } else {
    return null;
  }

  // Map function name to component type
  const componentType = FUNCTION_NAME_TO_TYPE[functionName];
  if (!componentType || !VALID_COMPONENT_TYPES.has(componentType)) {
    return null;
  }


  // Get the first argument (should be an object literal)
  const args = callExpression.getArguments();
  if (args.length === 0 || !Node.isObjectLiteralExpression(args[0])) {
    return null;
  }

  const configObject = args[0] as ObjectLiteralExpression;

  // Extract the component ID using the same rules as regex parser
  let componentId: string | null = null;

  // Look for 'id' property first (most common case)
  const idProperty = configObject.getProperty('id');
  if (idProperty && Node.isPropertyAssignment(idProperty)) {
    const idValue = idProperty.getInitializer();
    if (Node.isStringLiteral(idValue)) {
      componentId = idValue.getLiteralValue();
    }
  }

  // For statusComponents, look for 'type' property if 'id' not found (matches regex logic)
  if (!componentId && componentType === 'statusComponents') {
    const typeProperty = configObject.getProperty('type');
    if (typeProperty && Node.isPropertyAssignment(typeProperty)) {
      const typeValue = typeProperty.getInitializer();
      if (Node.isStringLiteral(typeValue)) {
        componentId = typeValue.getLiteralValue();
      }
    }
  }

  // For functionTools, look for 'name' property if 'id' not found (matches regex logic)
  if (!componentId && componentType === 'functionTools') {
    const nameProperty = configObject.getProperty('name');
    if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
      const nameValue = nameProperty.getInitializer();
      if (Node.isStringLiteral(nameValue)) {
        componentId = nameValue.getLiteralValue();
      }
    }
  }

  if (!componentId) {
    return null;
  }

  const startLine = callExpression.getStartLineNumber();


  return {
    id: componentId,
    type: componentType,
    filePath: relativePath,
    variableName: variableName,
    startLine,
    isInline,
  };
}

/**
 * Scan project directory for all components
 */
function scanProjectForComponents(projectRoot: string, debug: boolean = false): ComponentMatch[] {
  const allComponents: ComponentMatch[] = [];

  if (!existsSync(projectRoot)) {
    return allComponents;
  }


  const scanDir = (dir: string) => {
    try {
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules, build directories, and temp validation directories
          if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(item) && 
              !item.startsWith('.temp-validation-')) {
            scanDir(fullPath);
          }
        } else if (stat.isFile() && ['.ts', '.tsx', '.js', '.jsx'].includes(extname(item))) {
          const fileComponents = parseFileForComponents(fullPath, projectRoot, debug);
          allComponents.push(...fileComponents);
        }
      }
    } catch (error) {
      if (debug) {
        console.warn(`Failed to scan directory ${dir}: ${error}`);
      }
    }
  };

  scanDir(projectRoot);

  return allComponents;
}

/**
 * Build component registry from project parsing
 */
export function buildComponentRegistryFromParsing(
  projectRoot: string,
  debug: boolean = false
): ComponentRegistry {
  const registry = new ComponentRegistry();

  const allComponents = scanProjectForComponents(projectRoot, debug);

  // Sort components to prioritize exported over inline (in case of duplicates)
  allComponents.sort((a, b) => {
    if (a.id === b.id) {
      // Same ID: prioritize exported (false) over inline (true)
      return Number(a.isInline) - Number(b.isInline);
    }
    return 0; // Keep original order for different IDs
  });

  // Register components with registry (avoid duplicates by ID)
  const stats = {
    exported: 0,
    inline: 0,
    byType: {} as Record<string, number>,
  };

  const registeredTypeIds = new Set<string>(); // Use type:id instead of just id

  for (const component of allComponents) {
    const typeId = `${component.type}:${component.id}`;

    // Skip if already registered, unless this component should override existing
    if (registeredTypeIds.has(typeId) && !component.overrideExisting) {
      continue;
    }

    registeredTypeIds.add(typeId);

    if (component.variableName) {
      // Component has an actual variable name (declared with const/export const), use it
      
      if (component.overrideExisting && component.type === 'credentials') {
        // Use override method for credentials with env settings keys
        registry.overrideCredentialWithEnvKey(
          component.id,
          component.filePath,
          component.variableName
        );
      } else {
        registry.register(
          component.id,
          component.type,
          component.filePath,
          component.variableName,
          component.isInline
        );
      }
    } else {
      // Truly inline component with no variable name, let registry generate unique name
      registry.register(
        component.id,
        component.type,
        component.filePath,
        undefined, // Let registry handle naming with conflict resolution
        true // isInline = true
      );
    }

    // Update stats
    if (component.isInline) {
      stats.inline++;
    } else {
      stats.exported++;
    }
    stats.byType[component.type] = (stats.byType[component.type] || 0) + 1;
  }

  const total = stats.exported + stats.inline;

  return registry;
}

/**
 * Get component location info for a specific component ID
 */
export function findComponentById(componentId: string, projectRoot: string): ComponentMatch | null {
  const allComponents = scanProjectForComponents(projectRoot, false);
  return allComponents.find((comp) => comp.id === componentId) || null;
}

/**
 * Get all local component IDs
 */
export function getAllLocalComponentIds(projectRoot: string): Set<string> {
  const allComponents = scanProjectForComponents(projectRoot, false);
  return new Set(allComponents.map((comp) => comp.id));
}
