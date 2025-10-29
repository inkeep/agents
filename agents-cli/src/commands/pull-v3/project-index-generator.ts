/**
 * Project Index Generator - Generate index.ts file for new projects
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { generateProjectFile } from './components/project-generator';
import type { ComponentRegistry } from './utils/component-registry';

/**
 * Generate project index.ts file
 */
export async function generateProjectIndex(
  projectRoot: string,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry,
  projectId: string
): Promise<void> {
  const indexPath = join(projectRoot, 'index.ts');
  
  const defaultStyle = {
    quotes: 'single' as const,
    indentation: '  ',
    semicolons: true,
  };

  // Build project data with component arrays from the registry
  const registryComponents = localRegistry.getAllComponents();
  const projectDataWithRegistry = {
    ...remoteProject,
    agents: registryComponents.filter(c => c.type === 'agent').map(c => c.id),
    tools: registryComponents.filter(c => c.type === 'tool').map(c => c.id),
    externalAgents: registryComponents.filter(c => c.type === 'externalAgent').map(c => c.id),
    dataComponents: registryComponents.filter(c => c.type === 'dataComponent').map(c => c.id),
    artifactComponents: registryComponents.filter(c => c.type === 'artifactComponent').map(c => c.id),
    credentialReferences: registryComponents.filter(c => c.type === 'credential').map(c => c.id)
  };

  const content = generateProjectFile(projectId, projectDataWithRegistry, defaultStyle, localRegistry);
  
  writeFileSync(indexPath, content, 'utf8');
}