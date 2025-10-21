import { Client } from 'langsmith';
import type { CapturedEval, EvalInput, EvalResult } from './types';

export interface LangSmithConfig {
  apiKey?: string;
  projectName: string;
  datasetName?: string;
}

export class LangSmithIntegration {
  private client: Client;
  private projectName: string;
  private datasetName?: string;

  constructor(config: LangSmithConfig) {
    this.client = new Client({
      apiKey: config.apiKey || process.env.LANGSMITH_API_KEY,
    });
    this.projectName = config.projectName;
    this.datasetName = config.datasetName;
  }

  async logEvaluation(
    evalInput: EvalInput,
    evalResult: EvalResult,
    metadata?: Record<string, any>
  ): Promise<string> {
    const runId = crypto.randomUUID();

    const isSingleEval = 'trace' in evalInput;
    if (!isSingleEval) {
      console.log('⚠️  Multi-trace evaluation detected, logging summary only');
    }

    const capturedEval: CapturedEval = isSingleEval
      ? (evalInput as CapturedEval)
      : Object.values(evalInput as Record<string, CapturedEval>)[0];

    try {
      await this.client.createRun({
        id: runId,
        name: isSingleEval ? capturedEval.trace.metadata.agentName : 'Model Comparison',
        run_type: 'chain',
        project_name: this.projectName,
        inputs: isSingleEval
          ? {
              userMessage: capturedEval.userMessage,
              agentId: capturedEval.trace.metadata.agentId,
            }
          : {
              evalType: 'comparison',
              traceCount: Object.keys(evalInput).length,
            },
        outputs: {
          conversationId: capturedEval.trace.metadata.conversationId,
          timeline: capturedEval.trace.timeline,
        },
        start_time: capturedEval.trace.timing.startTime,
        end_time: capturedEval.trace.timing.endTime,
        extra: {
          metadata: {
            ...capturedEval.trace.metadata,
            ...metadata,
            exportedAt: capturedEval.trace.metadata.exportedAt,
          },
        },
      });

      await this.logEvaluationFeedback(runId, evalResult);

      console.log(
        `✅ Logged evaluation to LangSmith: https://smith.langchain.com/o/default/projects/p/${this.projectName}/r/${runId}`
      );

      return runId;
    } catch (error) {
      console.error('Failed to log evaluation to LangSmith:', error);
      throw error;
    }
  }

  private async logEvaluationFeedback(
    runId: string,
    evalResult: EvalResult
  ): Promise<void> {
    await this.client.createFeedback(runId, 'overall_score', {
      score: evalResult.score,
      value: evalResult.passed ? 1 : 0,
      comment: `Overall evaluation ${evalResult.passed ? 'passed' : 'failed'} with score ${evalResult.score.toFixed(3)}`,
    });

    for (const gradingResult of evalResult.gradingResults) {
      const detailedComment = `${gradingResult.reasoning}

📊 DETAILED ASSESSMENT:
${JSON.stringify(gradingResult.details, null, 2)}`;

      await this.client.createFeedback(runId, gradingResult.evaluatorName, {
        score: gradingResult.score,
        value: gradingResult.passed ? 1 : 0,
        comment: detailedComment,
      });
    }
  }

  async createDataset(name: string, description?: string): Promise<void> {
    try {
      await this.client.createDataset(name, {
        description: description || `Evaluation dataset for ${name}`,
      });
      this.datasetName = name;
      console.log(`✅ Created LangSmith dataset: ${name}`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`ℹ️  Dataset ${name} already exists, using existing dataset`);
        this.datasetName = name;
      } else {
        console.error('Failed to create dataset:', error);
        throw error;
      }
    }
  }

  async addExampleToDataset(
    capturedEval: CapturedEval,
    expectedOutput?: any
  ): Promise<void> {
    if (!this.datasetName) {
      throw new Error('Dataset name not set. Call createDataset first.');
    }

    await this.client.createExample(
      {
        userMessage: capturedEval.userMessage,
        agentId: capturedEval.trace.metadata.agentId,
      },
      expectedOutput || { conversationId: capturedEval.trace.metadata.conversationId },
      {
        datasetName: this.datasetName,
      }
    );

    console.log(`✅ Added example to dataset: ${this.datasetName}`);
  }

  async runBatchEvaluations(
    datasetName: string,
    evaluationFunction: (example: any) => Promise<EvalResult>
  ): Promise<void> {
    const dataset = await this.client.readDataset({ datasetName });
    const examples = this.client.listExamples({ datasetId: dataset.id });

    for await (const example of examples) {
      try {
        const result = await evaluationFunction(example);
        await this.logEvaluationFeedback(example.id, result);
      } catch (error) {
        console.error(`Failed to evaluate example ${example.id}:`, error);
      }
    }

    console.log(`✅ Completed batch evaluation for dataset: ${datasetName}`);
  }
}

export function createLangSmithIntegration(
  config: LangSmithConfig
): LangSmithIntegration {
  return new LangSmithIntegration(config);
}

