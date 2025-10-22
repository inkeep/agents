import type {
  ModelSettings,
  StopWhen as ProjectStopWhen,
} from '@inkeep/agents-core/client-exports';

export interface ProjectModels {
  base: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
}

// Re-export the shared type with the original name for backward compatibility
export type { ProjectStopWhen };

export interface Project {
  id?: string; // Backend field
  projectId: string; // Frontend field (mapped from id)
  tenantId: string;
  name: string;
  description: string;
  models: ProjectModels;
  stopWhen?: ProjectStopWhen;
  createdAt: string;
  updatedAt: string;
}
