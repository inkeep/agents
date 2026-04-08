import type { ProjectApiSelect, StopWhen as ProjectStopWhen } from '@inkeep/agents-core';

export interface Project {
  id: string;
  projectId: string; // Frontend field (mapped from id)
  name: string;
  description: string;
  models: NonNullable<ProjectApiSelect['models']>;
  stopWhen?: ProjectStopWhen;
  createdAt: string;
  updatedAt: string;
}
