import 'dotenv/config';
import { Langfuse } from 'langfuse';
import { getLogger } from './logger.js';
import { context as otelContext, propagation, trace as otelTrace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { W3CTraceContextPropagator } from '@opentelemetry/core';


const otelProvider = new NodeTracerProvider();
otelProvider.register({ propagator: new W3CTraceContextPropagator() });
const tracer = otelTrace.getTracer('dataset-runner');

const logger = getLogger('langfuse-dataset-runner');

interface RunConfig {
  datasetName: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  runName?: string;
  baseUrl?: string;
  apiKey?: string;
  metadata?: Record<string, any>;
}

interface ChatAPIResponse {
  error?: string;
  traceId?: string;
}


const REQUIRED_CONFIG_FIELDS = ['datasetName', 'tenantId', 'projectId', 'agentId'] as const;
const REQUIRED_ENV_VARS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'INKEEP_AGENTS_RUN_API_KEY',
  'INKEEP_AGENTS_RUN_API_URL',
] as const;

async function main() {
  try {
    const config = parseAndValidateConfig();
    await runDatasetEvaluation(config);
    logger.info({}, 'Dataset evaluation completed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Dataset evaluation failed');
    process.exit(1);
  }
}

function parseAndValidateConfig(): RunConfig {
  const config: Partial<RunConfig> = {
    tenantId: process.env.INKEEP_TENANT_ID,
    projectId: process.env.INKEEP_PROJECT_ID,
    agentId: process.env.INKEEP_AGENT_ID,
    runName: process.env.INKEEP_RUN_NAME,
    baseUrl: process.env.INKEEP_AGENTS_RUN_API_URL,
    apiKey: process.env.INKEEP_AGENTS_RUN_API_KEY,
    datasetName: 'inkeep-weather-example-dataset',
  };

  validateRequiredConfig(config);
  validateRequiredEnvVars();
  return config as RunConfig;
}

function validateRequiredConfig(config: Partial<RunConfig>): void {
  const missing = REQUIRED_CONFIG_FIELDS.filter((key) => !config[key]);
  if (missing.length > 0) throw new Error(`Missing required parameters: ${missing.join(', ')}`);
}

function validateRequiredEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

async function runDatasetEvaluation(config: RunConfig): Promise<void> {
  const { datasetName, tenantId, projectId, agentId, runName, baseUrl, apiKey, metadata } = config;

  logger.info({ datasetName, tenantId, projectId, agentId, runName }, 'Starting Langfuse dataset evaluation');

  const authKey = apiKey || process.env.INKEEP_AGENTS_RUN_API_KEY;
  if (!authKey) throw new Error('API key is required. Set INKEEP_AGENTS_RUN_API_KEY');
  if (!baseUrl) throw new Error('Base URL is required. Set INKEEP_AGENTS_RUN_API_URL');

  const langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL!,
  });

  const dataset = await langfuse.getDataset(datasetName);
  if (!dataset) throw new Error(`Dataset ${datasetName} not found in Langfuse`);

  logger.info(
    { datasetName: dataset.name, itemCount: dataset.items?.length || 0 },
    'Fetched dataset from Langfuse'
  );

  if (!Array.isArray(dataset.items) || dataset.items.length === 0) {
    throw new Error('Dataset has no items; cannot run evaluation.');
  }

  const chatClient = new ChatAPIClient(baseUrl, authKey, { tenantId, projectId, agentId });
  const runLabel = `dataset-run:${new Date().toISOString()}`;

  for (const item of dataset.items) {
    await processItem(item, {
      chatClient,
      langfuse,
      datasetName,
      runLabel,
      metadata: { tenantId, projectId, agentId, ...metadata },
    });
  }

  logger.info({ datasetName }, 'Dataset evaluation completed');
}

async function processItem(
  item: any,
  context: {
    chatClient: ChatAPIClient;
    langfuse: Langfuse;
    datasetName: string;
    runLabel: string;
    metadata: Record<string, any>;
  }
) {
  const log = getLogger(`dataset-item:${item.id}`);
  const userMessage = extractInputFromDatasetItem(item);
  if (!userMessage) {
    log.warn({ item }, 'No input found, skipping');
    return;
  }

  try {
    const result = await context.chatClient.processDatasetItem(
      userMessage,
      item,
      context.langfuse,
      context.datasetName
    );
    log.info({ traceId: result.traceId }, 'Processed dataset item');

    if (result.traceId) {
      const traceRef = context.langfuse.trace({ id: result.traceId });
      await context.langfuse.flushAsync();
      await item.link(traceRef, context.runLabel, {
        description: 'Dataset run via Inkeep Agent Framework',
        metadata: { datasetName: context.datasetName, ...context.metadata },
      });
      await context.langfuse.flushAsync();
      log.info({ traceId: result.traceId }, 'Linked dataset item to trace');
    }
  } catch (err) {
    log.error({ err }, 'Error processing dataset item');
  }
}

function extractInputFromDatasetItem(item: any): string | null {
  if (item?.input && typeof (item.input as any)?.message === 'string') return (item.input as any).message;
  logger.warn({ item }, 'Could not extract input text from dataset item');
  return null;
}

class ChatAPIClient {
  constructor(
    private baseUrl: string,
    private authKey: string,
    private ctx: { tenantId: string; projectId: string; agentId: string }
  ) { }

  async processDatasetItem(
    userMessage: string,
    datasetItem: any,
    langfuse: Langfuse,
    datasetName: string
  ): Promise<ChatAPIResponse> {
    return tracer.startActiveSpan('chat-api-call', async (span) => {
      try {
        const chatPayload = { messages: [{ role: 'user', content: userMessage }] };
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authKey}`,
          'x-inkeep-tenant-id': this.ctx.tenantId,
          'x-inkeep-project-id': this.ctx.projectId,
          'x-inkeep-agent-id': this.ctx.agentId,
        };
        propagation.inject(otelContext.active(), headers);

        const spanContext = otelTrace.getSpanContext(otelContext.active());
        const otelTraceId = spanContext?.traceId;
        if (!otelTraceId) {
          logger.warn({}, 'No active OTEL trace id; did OTEL provider register?');
        }

        const langfuseTrace = langfuse.trace({
          id: otelTraceId,
          name: `Dataset Item Execution: ${datasetItem.id}`,
          input: userMessage,
          metadata: {
            datasetName,
            datasetItemId: datasetItem.id,
            tenantId: this.ctx.tenantId,
            projectId: this.ctx.projectId,
            agentId: this.ctx.agentId,
            source: 'dataset-runner',
          },
          tags: ['dataset-evaluation'],
        });

        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(chatPayload),
        });

        const responseText = await response.text();
        const assistantResponse = parseSSEResponse(responseText);

        langfuseTrace.update({
          output: assistantResponse || 'No response generated',
          metadata: { httpStatus: response.status, ok: response.ok },
        });

        await langfuse.flushAsync();

        if (!response.ok) {
          return { error: `Chat API error: ${response.status} ${response.statusText}`, traceId: langfuseTrace.id };
        }
        return { traceId: langfuseTrace.id };
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), datasetItemId: datasetItem.id },
          'Error processing dataset item through chat API'
        );
        return { error: err instanceof Error ? err.message : String(err) };
      } finally {
        span.end();
      }
    });
  }
}

function parseSSEResponse(sseText: string): string {
  return sseText
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => {
      try {
        const data = JSON.parse(line.slice(6));
        return data.type === 'text-delta' && data.delta ? data.delta : '';
      } catch {
        return '';
      }
    })
    .join('')
    .trim();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
