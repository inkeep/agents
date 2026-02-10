import type {
  ModelSettings,
  StopWhen as ProjectStopWhen,
} from '@inkeep/agents-core/client-exports';

export interface ProjectModels {
  base: ModelSettings;
  summarizer?: ModelSettings;
}

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
