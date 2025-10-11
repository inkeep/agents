export interface AgentData {
  id: string;
  name: string;
  description?: string;
  subAgents: Record<string, any>;
  tools: Record<string, any>;
  contextConfigs: any[];
  credentialReferences: Record<string, any>;
}

export type FullAgentDefinition = AgentData;
