import type { z } from 'zod';
import type { MessageContent } from '@inkeep/agents-core';

export interface Dataset {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetItem {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetId: string;
  input: {
    messages: Array<{ role: string; content: MessageContent }>;
    headers?: Record<string, string>;
  };
  expectedOutput?: {
    messages?: Array<{ role: string; content: MessageContent }>;
    metadata?: Record<string, unknown>;
  };
  conversationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evaluator {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  prompt: string;
  schema: z.ZodType<any>;
  config?: {
    model?: string;
    temperature?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EvalRun {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  datasetId: string;
  evaluatorIds: string[];
  status: EvalRunStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EvalResultDetails {
    id: string;
    tenantId: string;
    projectId: string;
    evalRunId: string;
    datasetItemId: string;
    conversationId: string;
    status: EvalResultStatus;
    evaluatorResults?: Array<{
      evaluatorId: string;
      evaluatorName: string;
      score: number | null;
      passed: boolean | null;
      reasoning: string;
      metadata?: Record<string, unknown>;
    }>;
    createdAt: string;
    updatedAt: string;
    datasetItem: DatasetItem;
  }

export type EvalRunStatus = 'running' | 'completed' | 'failed';
export type EvalResultStatus = 'running' | 'completed' | 'failed';

export interface EvalSDKInterface {
  init(): Promise<void>;
  setConfig(config: EvalSDKConfig): void;
  
  datasets: {
    create(request: CreateDatasetRequest): Promise<Dataset>;
    get(id: string): Promise<Dataset>;
    list(): Promise<Dataset[]>;
    update(id: string, request: UpdateDatasetRequest): Promise<Dataset>;
    delete(id: string): Promise<void>;
    
    items: {
      create(datasetId: string, request: CreateDatasetItemRequest): Promise<DatasetItem>;
      get(id: string): Promise<DatasetItem>;
      list(datasetId: string): Promise<DatasetItem[]>;
      update(id: string, request: UpdateDatasetItemRequest): Promise<DatasetItem>;
      delete(id: string): Promise<void>;
    };
  };
  
  evaluators: {
    create(request: CreateEvaluatorRequest): Promise<Evaluator>;
    get(id: string): Promise<Evaluator>;
    list(): Promise<Evaluator[]>;
    update(id: string, request: UpdateEvaluatorRequest): Promise<Evaluator>;
    delete(id: string): Promise<void>;
  };
  
  evalRuns: {
    create(request: CreateEvalRunRequest): Promise<EvalRun>;
    get(id: string): Promise<EvalRun>;
    update(id: string, request: UpdateEvalRunRequest): Promise<EvalRun>;
    delete(id: string): Promise<void>;
    start(id: string): Promise<EvalRun>;
    stop(id: string): Promise<EvalRun>;
    
    results: {
      get(evalRunId: string): Promise<EvalResultDetails>;
      list(evalRunId: string): Promise<EvalResultDetails[]>;
    };
  };
}

export interface EvalSDKConfig {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  projectId: string;
}

export interface CreateDatasetRequest {
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDatasetRequest {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateDatasetItemRequest {
  agentId: string;
  input: {
    messages: Array<{ role: string; content: MessageContent }>;
    headers?: Record<string, string>;
  };
  expectedOutput?: {
    messages?: Array<{ role: string; content: MessageContent }>;
    metadata?: Record<string, unknown>;
  };
  conversationId: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDatasetItemRequest {
  input?: {
    messages?: Array<{ role: string; content: MessageContent }>;
    headers?: Record<string, string>;
  };
  expectedOutput?: {
    messages?: Array<{ role: string; content: MessageContent }>;
    metadata?: Record<string, unknown>;
  };
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateEvaluatorRequest {
  name: string;
  description: string;
  prompt: string;
  schema: z.ZodType<any>;
  config?: {
    model?: string;
    temperature?: number;
  };
}

export interface UpdateEvaluatorRequest {
  name?: string;
  description?: string;
  prompt?: string;
  schema?: z.ZodType<any>;
  config?: {
    model?: string;
    temperature?: number;
  };
}

export interface CreateEvalRunRequest {
  name: string;
  description: string;
  datasetId: string;
  evaluatorIds: string[];
}

export interface UpdateEvalRunRequest {
  name?: string;
  description?: string;
  evaluatorIds?: string[];
}


