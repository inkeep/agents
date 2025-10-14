import type { z } from 'zod';

export interface CapturedEval {
  agentDefinition: any;
  userMessage: string;
  trace: {
    metadata: {
      conversationId: string;
      agentName: string;
      agentId: string;
      exportedAt: string;
    };
    timing: {
      startTime: number;
      endTime: number;
      durationMs: number;
    };
    timeline: any[];
  };
}

export interface ExpectedBehavior<T extends z.ZodType = z.ZodType> {
  prompt?: string;
  gradingSchema: T;
  weight?: number;
}

export interface EvalConfig {
  maxTurns?: number;
  timeout?: number;
  temperature?: number;
  model?: string;
}

export interface EvalResult<T = any> {
  passed: boolean;
  score: number;
  actualOutput: T;
  expectedOutput: T;
  gradingResults: GradingResult[];
}

export interface GradingResult {
  evaluatorName: string;
  passed: boolean;
  score: number;
  reasoning: string;
  details: Record<string, any>;
}

export interface Evaluator<T extends z.ZodType = z.ZodType> {
  name: string;
  schema: T;
  prompt: string;
  weight?: number;
  grade(capturedEval: any): Promise<GradingResult>;
}

