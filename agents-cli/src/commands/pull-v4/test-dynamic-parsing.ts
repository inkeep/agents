/**
 * Test the dynamic AST-based parsing approach
 */

import { parseProjectWithAST } from './ast-parser';
import { discoverSDKPatterns } from './sdk-discovery';
import chalk from 'chalk';

async function testDynamicParsing() {
  console.log(chalk.cyan('🧪 Testing dynamic AST-based parsing...\n'));
  
  try {
    // First test SDK discovery
    console.log(chalk.yellow('--- Testing SDK Discovery ---'));
    const patterns = await discoverSDKPatterns();
    
    console.log(chalk.gray('Discovered patterns:'));
    for (const [name, pattern] of patterns) {
      console.log(chalk.gray(`  ${name}: ${pattern.category} -> ${pattern.componentType}`));
    }
    
    // Then test parsing the complex-example project
    console.log(chalk.yellow('\n--- Testing Project Parsing ---'));
    const projectRoot = '/Users/timothycardona/inkeep/agents/examples/complex-example';
    const components = await parseProjectWithAST(projectRoot);
    
    console.log(chalk.gray('\nFound components:'));
    const componentsByType = new Map<string, number>();
    
    for (const component of components) {
      const count = componentsByType.get(component.type) || 0;
      componentsByType.set(component.type, count + 1);
      
      console.log(chalk.gray(`  ${component.type}: ${component.id} (${component.category}) in ${component.filePath}`));
      
      // Show parameters for the first few components to verify what's captured
      if (componentsByType.get(component.type) === 1) {
        console.log(chalk.yellow(`    Parameters: ${component.parameters?.substring(0, 100)}...`));
      }
    }
    
    console.log(chalk.green('\n✅ Summary:'));
    for (const [type, count] of componentsByType) {
      console.log(chalk.green(`  ${type}: ${count} components`));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDynamicParsing();
}