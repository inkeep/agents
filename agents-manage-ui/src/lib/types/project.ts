export interface ModelSettings {
  model: string;
  providerOptions?: Record<string, any>;
}

export interface ProjectModels {
  base: ModelSettings;
  structuredOutput?: ModelSettings;
  summarizer?: ModelSettings;
}

export interface ProjectStopWhen {
  transferCountIs?: number;
  stepCountIs?: number;
}

export interface Project {
  id?: string; // Backend field
  projectId: string; // Frontend field (mapped from id)
  name: string;
  description: string;
  models: ProjectModels;
  stopWhen?: ProjectStopWhen;
  createdAt: string;
  updatedAt: string;
}
