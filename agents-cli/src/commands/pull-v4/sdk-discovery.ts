/**
 * Dynamic SDK Discovery - Automatically discover component patterns from the SDK
 * 
 * Instead of maintaining hardcoded lists of SDK functions, this module:
 * 1. Analyzes the actual @inkeep/agents-sdk source code
 * 2. Discovers exported functions and their signatures
 * 3. Classifies them into component types
 * 4. Provides dynamic pattern matching
 */

import { Project, SyntaxKind, Node, FunctionDeclaration, VariableDeclaration } from 'ts-morph';
import chalk from 'chalk';

export interface SDKFunction {
  name: string;
  category: 'static' | 'environment-aware' | 'utility';
  componentType?: string; // maps to ComponentType
  returnType?: string;
  parameters: SDKParameter[];
}

export interface SDKParameter {
  name?: string;
  type: string;
  required: boolean;
}

/**
 * Discover all SDK patterns by analyzing the actual SDK source code
 */
export async function discoverSDKPatterns(): Promise<Map<string, SDKFunction>> {
  console.log(chalk.cyan('🔍 Discovering SDK patterns dynamically...'));
  
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    }
  });
  
  try {
    // Find the SDK package location using import.meta.resolve (ES modules)
    let sdkPath: string;
    try {
      sdkPath = await import.meta.resolve('@inkeep/agents-sdk');
      // Convert file:// URL to path
      sdkPath = sdkPath.replace('file://', '');
      console.log(chalk.gray(`Found SDK at: ${sdkPath}`));
    } catch {
      console.log(chalk.yellow('Could not resolve @inkeep/agents-sdk, using fallback patterns'));
      return getFallbackPatterns();
    }
    
    // Add SDK source files to analysis
    // We might need to analyze the package's TypeScript source, not just the compiled JS
    const packagePath = sdkPath.replace('/dist/', '/src/').replace('.js', '.ts');
    
    let sourceFile;
    try {
      sourceFile = project.addSourceFileAtPath(packagePath);
    } catch {
      // Fallback to the compiled version if source isn't available
      sourceFile = project.addSourceFileAtPath(sdkPath);
    }
    
    const sdkFunctions = new Map<string, SDKFunction>();
    
    // Analyze exported functions
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    
    for (const [exportName, declarations] of exportedDeclarations) {
      for (const declaration of declarations) {
        const sdkFunction = analyzeExport(exportName, declaration);
        if (sdkFunction) {
          sdkFunctions.set(exportName, sdkFunction);
          console.log(chalk.gray(`  Found: ${exportName} -> ${sdkFunction.category} (${sdkFunction.componentType})`));
        }
      }
    }
    
    // Also check for namespace exports like envSettings
    analyzeNamespaces(sourceFile, sdkFunctions);
    
    console.log(chalk.green(`✅ Discovered ${sdkFunctions.size} SDK patterns`));
    return sdkFunctions;
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to discover SDK patterns: ${error}`));
    return getFallbackPatterns();
  }
}

/**
 * Analyze a single export declaration to determine its pattern
 */
function analyzeExport(name: string, declaration: Node): SDKFunction | null {
  // Function declarations: export function mcpTool() {}
  if (Node.isFunctionDeclaration(declaration)) {
    return analyzeFunctionDeclaration(name, declaration);
  }
  
  // Variable declarations: export const agent = () => {}
  if (Node.isVariableDeclaration(declaration)) {
    return analyzeVariableDeclaration(name, declaration);
  }
  
  // Type aliases, interfaces, etc. - skip for now
  return null;
}

/**
 * Analyze a function declaration
 */
function analyzeFunctionDeclaration(name: string, func: FunctionDeclaration): SDKFunction | null {
  const returnType = func.getReturnType().getText();
  const parameters = analyzeParameters(func.getParameters());
  
  // Classify based on name patterns and return types
  const category = classifyFunction(name, returnType);
  const componentType = mapToComponentType(name, returnType);
  
  if (!componentType) return null;
  
  return {
    name,
    category,
    componentType,
    returnType,
    parameters
  };
}

/**
 * Analyze a variable declaration (arrow functions, etc.)
 */
function analyzeVariableDeclaration(name: string, variable: VariableDeclaration): SDKFunction | null {
  const type = variable.getType().getText();
  const initializer = variable.getInitializer();
  
  // For now, treat as function if it looks like one
  if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
    const category = classifyFunction(name, type);
    const componentType = mapToComponentType(name, type);
    
    if (!componentType) return null;
    
    return {
      name,
      category,
      componentType,
      returnType: type,
      parameters: [] // TODO: extract parameters from arrow functions
    };
  }
  
  return null;
}

/**
 * Classify a function based on its name and return type
 */
function classifyFunction(name: string, returnType: string): 'static' | 'environment-aware' | 'utility' {
  // Environment-aware patterns
  if (name.includes('getEnvironment') || returnType.includes('Environment')) {
    return 'environment-aware';
  }
  
  // Component creation functions
  if (['mcpTool', 'agent', 'dataComponent', 'artifactComponent', 'statusComponent', 
       'functionTool', 'credential', 'contextConfig', 'externalAgent'].includes(name)) {
    return 'static';
  }
  
  // Everything else is utility
  return 'utility';
}

/**
 * Map SDK function names to component types
 */
function mapToComponentType(name: string, returnType: string): string | null {
  const mapping: Record<string, string> = {
    'mcpTool': 'tools',
    'agent': 'agents', 
    'subAgent': 'subAgents',
    'dataComponent': 'dataComponents',
    'artifactComponent': 'artifactComponents',
    'statusComponent': 'statusComponents',
    'functionTool': 'functionTools',
    'registerEnvironmentSettings': 'environments',
    'credential': 'credentials',
    'contextConfig': 'contextConfigs',
    'externalAgent': 'externalAgents'
  };
  
  // Direct name mapping
  if (mapping[name]) {
    return mapping[name];
  }
  
  // Return type mapping
  if (returnType.includes('McpTool')) return 'tools';
  if (returnType.includes('Agent')) return 'agents';
  if (returnType.includes('DataComponent')) return 'dataComponents';
  // ... add more return type mappings
  
  return null;
}

/**
 * Analyze function parameters
 */
function analyzeParameters(params: any[]): SDKParameter[] {
  return params.map(param => ({
    name: param.getName(),
    type: param.getType().getText(),
    required: !param.isOptional()
  }));
}

/**
 * Look for namespace exports like envSettings
 */
function analyzeNamespaces(sourceFile: any, sdkFunctions: Map<string, SDKFunction>) {
  // Look for namespace or object exports that might contain environment-aware functions
  const variableStatements = sourceFile.getVariableStatements();
  
  for (const statement of variableStatements) {
    if (statement.hasExportKeyword()) {
      const declarations = statement.getDeclarations();
      for (const decl of declarations) {
        const name = decl.getName();
        if (name === 'envSettings') {
          // Found envSettings - analyze its methods
          analyzeEnvSettings(decl, sdkFunctions);
        }
      }
    }
  }
}

/**
 * Analyze the envSettings object for environment-aware methods
 */
function analyzeEnvSettings(declaration: any, sdkFunctions: Map<string, SDKFunction>) {
  // This would need more sophisticated analysis of the envSettings object
  // For now, add the known pattern
  sdkFunctions.set('envSettings.getEnvironmentMcp', {
    name: 'envSettings.getEnvironmentMcp',
    category: 'environment-aware',
    componentType: 'tools',
    returnType: 'McpTool',
    parameters: [
      { name: 'key', type: 'string', required: true }
    ]
  });
}

/**
 * Fallback patterns if dynamic discovery fails
 */
function getFallbackPatterns(): Map<string, SDKFunction> {
  return new Map([
    ['mcpTool', { name: 'mcpTool', category: 'static', componentType: 'tools', parameters: [] }],
    ['agent', { name: 'agent', category: 'static', componentType: 'agents', parameters: [] }],
    ['envSettings.getEnvironmentMcp', { 
      name: 'envSettings.getEnvironmentMcp', 
      category: 'environment-aware', 
      componentType: 'tools', 
      parameters: [{ name: 'key', type: 'string', required: true }]
    }]
  ]);
}