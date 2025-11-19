/**
 * Types for Full Project Operations
 */

import type { ArtifactComponent } from '../api/artifact-components';
import type { Credential } from '../api/credentials';
import type { DataComponent } from '../api/data-components';
import type { ExternalAgent } from '../api/external-agents';
import type { FullAgentDefinition } from './agent-full';
import type { MCPTool } from './tools';

/**
 * Full Project Definition including all nested resources
 */
export interface FullProjectDefinition {
  id: string;
  name: string;
  description?: string;
  models: {
    base: string;
    [key: string]: string;
  };
  stopWhen?: {
    maxAgentTurns?: number;
    maxTaskDepth?: number;
  };
  agents: Record<string, FullAgentDefinition>;
  tools: Record<string, MCPTool>;
  dataComponents?: Record<string, DataComponent>;
  artifactComponents?: Record<string, ArtifactComponent>;
  externalAgents?: Record<string, ExternalAgent>;
  credentialReferences?: Record<string, Credential>;
  functions?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}
