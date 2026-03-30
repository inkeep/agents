import type { FullProjectDefinition } from '@inkeep/agents-core';
import { buildComponentRegistryFromParsing } from './component-parser';
import { GenerationResolver } from './generation-resolver';
import {
  collectCompleteAgentIds,
  type GenerationContext,
  type ProjectPaths,
  type SkippedAgent,
  validateProject,
} from './generation-types';
import { generationTasks } from './generators';
import { writeTypeScriptFile } from './typescript-file-writer';

export type { ProjectPaths } from './generation-types';

export interface IntrospectOptions {
  project: FullProjectDefinition;
  paths: ProjectPaths;
  writeMode?: 'merge' | 'overwrite';
  debug?: boolean;
}

export async function introspectGenerate({
  project,
  paths,
  writeMode = 'merge',
  debug = false,
}: IntrospectOptions): Promise<void> {
  validateProject(project);

  const skippedAgents: SkippedAgent[] = [];
  const completeAgentIds = collectCompleteAgentIds(project, skippedAgents);
  const existingComponentRegistry =
    writeMode === 'merge' ? buildComponentRegistryFromParsing(paths.projectRoot, debug) : undefined;
  const resolver = new GenerationResolver({
    project,
    projectRoot: paths.projectRoot,
    completeAgentIds,
    existingComponentRegistry,
  });
  const context: GenerationContext = {
    project,
    paths,
    completeAgentIds,
    existingComponentRegistry,
    resolver,
  };
  const generatedFiles: string[] = [];

  for (const task of Object.values(generationTasks)) {
    const records = task.collect(context);
    for (const record of records) {
      const sourceFile = task.generate(record.payload);
      writeTypeScriptFile(record.filePath, sourceFile.getFullText(), writeMode);
      generatedFiles.push(record.filePath);
    }
  }

  if (debug) {
    console.log(`Generated ${generatedFiles.length} files`);
    if (skippedAgents.length) {
      console.log(
        `Skipped ${skippedAgents.length} agent(s): ${skippedAgents
          .map((agent) => `${agent.id} (${agent.reason})`)
          .join(', ')}`
      );
    }
  }
}
