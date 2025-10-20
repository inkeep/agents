import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { FileSpec } from '../commands/pull.batch-generator-with-tools';
import type { GenerationPlan } from './types';

/**
 * Build file specs from a generation plan
 * Converts the plan-based structure to the file spec structure needed by batch generator
 */
export async function buildFileSpecsFromPlan(
  plan: GenerationPlan,
  projectData: FullProjectDefinition,
  dirs: {
    projectRoot: string;
    agentsDir: string;
    toolsDir: string;
    dataComponentsDir: string;
    artifactComponentsDir: string;
    statusComponentsDir: string;
    environmentsDir: string;
  }
): Promise<FileSpec[]> {
  const fileSpecs: FileSpec[] = [];

  // Build filename and variable name mappings from the plan's flat file array
  const toolFilenames = new Map<string, string>();
  const componentFilenames = new Map<string, string>();
  const toolVariableNames = new Map<string, string>();
  const componentVariableNames = new Map<string, string>();

  // Collect filenames and variable names from plan files
  for (const fileInfo of plan.files) {
    for (const entity of fileInfo.entities) {
      const fileName = fileInfo.path.split('/').pop()?.replace('.ts', '') || '';
      const variableName = entity.variableName || entity.exportName || entity.id;

      if (entity.entityType === 'tool') {
        toolFilenames.set(entity.id, fileName);
        toolVariableNames.set(entity.id, variableName);
      } else if (
        entity.entityType === 'dataComponent' ||
        entity.entityType === 'artifactComponent' ||
        entity.entityType === 'statusComponent'
      ) {
        componentFilenames.set(entity.id, fileName);
        componentVariableNames.set(entity.id, variableName);
      }
    }
  }

  // Process each file in the plan
  for (const fileInfo of plan.files) {
    const fullPath = join(dirs.projectRoot, fileInfo.path);

    // Handle different file types
    if (fileInfo.type === 'index') {
      fileSpecs.push({
        type: 'index',
        id: projectData.id,
        data: projectData,
        outputPath: fullPath,
        toolFilenames,
        componentFilenames,
        toolVariableNames,
        componentVariableNames,
      });
    } else if (fileInfo.type === 'agent') {
      // Find the agent entity in this file
      const agentEntity = fileInfo.entities.find((e) => e.entityType === 'agent');
      if (agentEntity) {
        const agentData = projectData.agents?.[agentEntity.id];
        if (agentData) {
          fileSpecs.push({
            type: 'agent',
            id: agentEntity.id,
            data: agentData,
            outputPath: fullPath,
            toolFilenames,
            componentFilenames,
            toolVariableNames,
            componentVariableNames,
          });
        }
      }
    } else if (fileInfo.type === 'tool') {
      // Find the tool entity in this file
      const toolEntity = fileInfo.entities.find((e) => e.entityType === 'tool');
      if (toolEntity) {
        const toolData = projectData.tools?.[toolEntity.id];
        if (toolData) {
          const variableName = toolEntity.variableName || toolEntity.exportName || toolEntity.id;
          fileSpecs.push({
            type: 'tool',
            id: toolEntity.id,
            data: toolData,
            outputPath: fullPath,
            variableName,
          });
        }
      }
    } else if (fileInfo.type === 'dataComponent') {
      // Find the data component entity in this file
      const componentEntity = fileInfo.entities.find((e) => e.entityType === 'dataComponent');
      if (componentEntity) {
        const componentData = projectData.dataComponents?.[componentEntity.id];
        if (componentData) {
          const variableName = componentEntity.variableName || componentEntity.exportName || componentEntity.id;
          fileSpecs.push({
            type: 'data_component',
            id: componentEntity.id,
            data: componentData,
            outputPath: fullPath,
            variableName,
          });
        }
      }
    } else if (fileInfo.type === 'artifactComponent') {
      // Find the artifact component entity in this file
      const componentEntity = fileInfo.entities.find((e) => e.entityType === 'artifactComponent');
      if (componentEntity) {
        const componentData = projectData.artifactComponents?.[componentEntity.id];
        if (componentData) {
          const variableName = componentEntity.variableName || componentEntity.exportName || componentEntity.id;
          fileSpecs.push({
            type: 'artifact_component',
            id: componentEntity.id,
            data: componentData,
            outputPath: fullPath,
            variableName,
          });
        }
      }
    } else if (fileInfo.type === 'statusComponent') {
      // Find the status component entity in this file
      const componentEntity = fileInfo.entities.find((e) => e.entityType === 'statusComponent');
      if (componentEntity) {
        // Status components come from agent definitions
        // Find the component data from the agent's statusUpdates
        for (const agent of Object.values(projectData.agents || {})) {
          const agentObj = agent as any;
          const statusComponents = agentObj.statusUpdates?.statusComponents || [];

          for (const statusComponent of statusComponents) {
            if (statusComponent.type === componentEntity.id) {
              const variableName = componentEntity.variableName || componentEntity.exportName || componentEntity.id;
              fileSpecs.push({
                type: 'status_component',
                id: componentEntity.id,
                data: statusComponent,
                outputPath: fullPath,
                variableName,
              });
              break;
            }
          }
        }
      }
    }
    // Skip environment files - they're handled by generateEnvironmentFiles
  }

  return fileSpecs;
}
