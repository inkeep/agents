import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { Project, ProjectModels } from '@/lib/types/project';

/**
 * Converts a FullProjectDefinition to a Project type.
 * Handles null/undefined cases for models and stopWhen.
 */
export function convertFullProjectToProject(
  fullProject: FullProjectDefinition,
  tenantId: string
): Project {
  // Convert models - FullProjectDefinition has models: ProjectModel | null
  // Project requires models: ProjectModels with required base
  let models: ProjectModels;
  if (fullProject.models?.base) {
    models = {
      base: fullProject.models.base,
      ...(fullProject.models.structuredOutput && {
        structuredOutput: fullProject.models.structuredOutput,
      }),
      ...(fullProject.models.summarizer && {
        summarizer: fullProject.models.summarizer,
      }),
    };
  } else {
    // If models is null or base is missing, create a default structure
    // This shouldn't happen in practice, but we handle it gracefully
    models = {
      base: {
        model: '',
        providerOptions: undefined,
      },
    };
  }

  // Convert stopWhen - FullProjectDefinition has stopWhen?: StopWhen | null | undefined
  // Project has stopWhen?: ProjectStopWhen
  const stopWhen = fullProject.stopWhen || undefined;

  return {
    id: fullProject.id,
    projectId: fullProject.id,
    tenantId,
    name: fullProject.name,
    description: fullProject.description,
    models,
    stopWhen,
    createdAt: fullProject.createdAt || new Date().toISOString(),
    updatedAt: fullProject.updatedAt || new Date().toISOString(),
  };
}
