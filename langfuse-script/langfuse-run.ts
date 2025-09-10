#!/usr/bin/env tsx

import 'dotenv/config';
import { Langfuse } from 'langfuse';
import { nanoid } from 'nanoid';
import { getLogger } from './logger.js';

const logger = getLogger('langfuse-dataset-runner');

interface RunConfig {
  datasetId: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  agentId?: string;
  runName?: string;
  baseUrl?: string;
  apiKey?: string;
  metadata?: Record<string, any>;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Missing required parameter: --dataset-id');
    console.error('Usage: pnpm tsx langfuse-run.ts --dataset-id <id>');
    process.exit(1);
  }

  // Parse command line arguments and merge with environment variables
  const config: Partial<RunConfig> = {
    // Set defaults from environment variables
    tenantId: process.env.INKEEP_TENANT_ID,
    projectId: process.env.INKEEP_PROJECT_ID,
    graphId: process.env.INKEEP_GRAPH_ID,
    agentId: process.env.INKEEP_AGENT_ID,
    runName: process.env.INKEEP_RUN_NAME,
    baseUrl: process.env.INKEEP_AGENTS_RUN_API_URL,
    apiKey: process.env.INKEEP_API_KEY,
  };

  // Parse dataset-id from command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--dataset-id':
        config.datasetId = value;
        break;
      default:
        console.error(`Unknown flag: ${flag}. Only --dataset-id is supported.`);
        console.error('Usage: pnpm tsx langfuse-run.ts --dataset-id <id>');
        process.exit(1);
    }
  }

  // Validate required parameters
  const required = ['datasetId', 'tenantId', 'projectId', 'graphId'];
  const missing = required.filter((key) => !config[key as keyof RunConfig]);

  if (missing.length > 0) {
    console.error(`Missing required parameters: ${missing.join(', ')}`);
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Validate environment variables
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    console.error(
      'Missing required environment variables: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY'
    );
    process.exit(1);
  }

  try {
    await runDatasetEvaluation(config as RunConfig);
    console.log('Dataset evaluation completed successfully');
    process.exit(0);
  } catch (error) {
    console.error(
      'Dataset evaluation failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

async function runDatasetEvaluation(config: RunConfig): Promise<void> {
  const { datasetId, tenantId, projectId, graphId, agentId, runName, baseUrl, apiKey, metadata } =
    config;

  logger.info(
    {
      datasetId,
      tenantId,
      projectId,
      graphId,
      agentId,
      runName,
    },
    'Starting Langfuse dataset evaluation'
  );

  // Get API key from config or environment
  const authKey = apiKey || process.env.INKEEP_API_KEY;
  if (!authKey) {
    throw new Error(
      'API key is required. Provide --api-key or set INKEEP_API_KEY environment variable'
    );
  }

  const chatBaseUrl = baseUrl || 'http://localhost:3003';

  logger.info({ chatBaseUrl }, 'Starting dataset evaluation run');

  // Process the dataset
  await processDatasetRun({
    datasetId,
    runName,
    metadata,
    chatBaseUrl,
    authKey,
    agentId,
    tenantId,
    projectId,
    graphId,
  });

  logger.info('Dataset evaluation completed');
}

// Helper function to process the dataset run using chat API
async function processDatasetRun({
  datasetId,
  runName,
  metadata,
  chatBaseUrl,
  authKey,
  agentId,
  tenantId,
  projectId,
  graphId,
}: {
  datasetId: string;
  runName?: string;
  metadata?: Record<string, any>;
  chatBaseUrl: string;
  authKey: string;
  agentId?: string;
  tenantId: string;
  projectId: string;
  graphId: string;
}): Promise<void> {
  logger.info(
    {
      datasetId,
      agentId,
      chatBaseUrl,
    },
    'Starting dataset processing'
  );

  try {
    // Step 1: Fetch dataset from Langfuse
    const dataset = await fetchDatasetFromLangfuse(datasetId);

    if (!dataset || !dataset.items || dataset.items.length === 0) {
      throw new Error(`No dataset items found for dataset ${datasetId}`);
    }

    logger.info(
      {
        datasetId,
        itemCount: dataset.items.length,
      },
      'Fetched dataset from Langfuse'
    );

    // Step 2: Process each dataset item through the agent graph
    const results: Array<{
      datasetItemId: string;
      input: string;
      output: string | null;
      success: boolean;
      metadata?: {
        iterations?: number;
        conversationId: string;
      };
      error?: string;
    }> = [];
    for (let i = 0; i < dataset.items.length; i++) {
      const item = dataset.items[i];
      const itemLogger = logger.child({ datasetItemId: item.id, itemIndex: i });

      try {
        itemLogger.info('Processing dataset item through agent graph');

        // Extract the input text from the dataset item
        const userMessage = extractInputFromDatasetItem(item);

        if (!userMessage) {
          itemLogger.warn('No input text found in dataset item, skipping');
          continue;
        }

        // Create a unique conversation ID for this dataset item
        const conversationId = `dataset_run_${nanoid()}`;

        // Run the dataset item through the chat API
        const result = await runDatasetItemThroughChatAPI({
          conversationId,
          userMessage,
          agentId,
          datasetItem: item,
          chatBaseUrl,
          authKey,
          executionContext: {
            tenantId,
            projectId,
            graphId,
          },
          _datasetId: datasetId,
        });

        results.push({
          datasetItemId: item.id,
          input: userMessage,
          output: result.response || null,
          success: result.success,
          metadata: {
            iterations: result.iterations,
            conversationId,
          },
        });

        itemLogger.info(
          {
            success: result.success,
            iterations: result.iterations,
          },
          'Completed processing dataset item'
        );
      } catch (error) {
        itemLogger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'Error processing dataset item'
        );

        results.push({
          datasetItemId: item.id,
          input: extractInputFromDatasetItem(item) || 'unknown',
          output: null,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 3: Send results back to Langfuse
    await sendResultsToLangfuse({
      datasetId,
      runName,
      results,
      metadata,
    });

    logger.info(
      {
        datasetId,
        totalItems: dataset.items.length,
        successfulItems: results.filter((r) => r.success).length,
        failedItems: results.filter((r) => !r.success).length,
      },
      'Dataset run processing completed'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        datasetId,
      },
      'Error in dataset run processing'
    );
    throw error;
  }
}

// Helper function to fetch dataset items from Langfuse
async function fetchDatasetFromLangfuse(datasetId: string): Promise<any> {
  try {
    // Initialize Langfuse client
    const langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
      secretKey: process.env.LANGFUSE_SECRET_KEY || '',
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
    });

    logger.info({ datasetId }, 'Fetching dataset from Langfuse via API');

    // Fetch the dataset using the Langfuse SDK
    const dataset = await langfuse.getDataset(datasetId);

    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found in Langfuse`);
    }

    // Handle the case where dataset.items might not be directly available
    const items = dataset.items;
    // if (!items) {
    //   // Try to fetch items separately if not included in the dataset response
    //   logger.info({ datasetId }, 'Dataset items not included, fetching separately...');
    //   try {
    //     // Note: This might require a different API call depending on Langfuse SDK version
    //     // items = await langfuse.getDatasetItems(datasetId);
    //     items = [];
    //   } catch (error) {
    //     logger.error(
    //       {
    //         error: error instanceof Error ? error.message : String(error),
    //       },
    //       'Failed to fetch dataset items separately'
    //     );
    //     items = [];
    //   }
    // }

    logger.info(
      {
        datasetId,
        datasetName: dataset.name,
        itemCount: items?.length || 0,
      },
      'Successfully fetched dataset from Langfuse'
    );

    return { ...dataset, items };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        datasetId,
      },
      'Failed to fetch dataset from Langfuse'
    );
    throw error;
  }
}

// Helper function to extract input text from a dataset item
function extractInputFromDatasetItem(item: any): string | null {
  // Handle different possible formats of dataset items
  if (typeof item.input === 'string') {
    return item.input;
  }

  if (item.input && typeof item.input.text === 'string') {
    return item.input.text;
  }

  if (item.input && typeof item.input.content === 'string') {
    return item.input.content;
  }

  if (item.input && typeof item.input.message === 'string') {
    return item.input.message;
  }

  if (item.input && typeof item.input.question === 'string') {
    return item.input.question;
  }

  if (typeof item.question === 'string') {
    return item.question;
  }

  if (typeof item.prompt === 'string') {
    return item.prompt;
  }

  logger.warn({ item }, 'Could not extract input text from dataset item');
  return null;
}

// Helper function to run a dataset item through the chat API
async function runDatasetItemThroughChatAPI({
  conversationId,
  userMessage,
  agentId,
  datasetItem,
  chatBaseUrl,
  authKey,
  executionContext,
  _datasetId,
}: {
  conversationId: string;
  userMessage: string;
  agentId?: string;
  datasetItem: any;
  chatBaseUrl: string;
  authKey: string;
  executionContext: {
    tenantId: string;
    projectId: string;
    graphId: string;
  };
  _datasetId: string;
}): Promise<{
  success: boolean;
  response?: string;
  error?: string;
  iterations?: number;
  traceId?: string;
}> {
  try {
    // Prepare the chat request payload for chatDataStream endpoint
    const chatPayload = {
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      conversationId,
      ...(agentId && { agentId }),
    };

    // Make request to chat endpoint (using chatDataStream route for proper span attributes)
    const response = await fetch(`${chatBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authKey}`,
        'x-inkeep-tenant-id': executionContext.tenantId,
        'x-inkeep-project-id': executionContext.projectId,
        'x-inkeep-graph-id': executionContext.graphId,
      },
      body: JSON.stringify(chatPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText,
          conversationId,
          datasetItemId: datasetItem.id,
        },
        'Chat API request failed'
      );

      return {
        success: false,
        error: `Chat API error: ${response.status} ${response.statusText}`,
      };
    }

    const responseText = await response.text();
    logger.info({ responseText }, 'Response text');
    const assistantResponse = parseSSEResponse(responseText);

    return {
      success: true,
      response: assistantResponse || 'No response generated',
      iterations: 1, // Simple chat API call
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        conversationId,
        datasetItemId: datasetItem.id,
      },
      'Error running dataset item through chat API'
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Helper function to parse SSE response and extract assistant message
function parseSSEResponse(sseText: string): string {
  const lines = sseText.split('\n');
  let assistantResponse = '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));

        // Handle Vercel AI data stream format (from /api/chat endpoint)
        if (data.type === 'text-delta' && data.delta) {
          assistantResponse += data.delta;
        }
        // Handle OpenAI chat completions format (legacy support)
        else if (data.choices?.[0]?.delta?.content) {
          const content = data.choices[0].delta.content;
          // Filter out system metadata messages (data-operation type messages)
          if (content.includes('"type":"data-operation"')) {
            continue;
          }
          assistantResponse += content;
        }
      } catch {}
    }
  }

  return assistantResponse.trim();
}

// Helper function to send results back to Langfuse
async function sendResultsToLangfuse({
  datasetId,
  runName,
  results,
  metadata,
}: {
  datasetId: string;
  runName?: string;
  results: any[];
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    // Initialize Langfuse client
    const langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
      secretKey: process.env.LANGFUSE_SECRET_KEY || '',
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
    });

    logger.info(
      {
        datasetId,
        runName,
        resultCount: results.length,
        successCount: results.filter((r) => r.success).length,
      },
      'Sending results to Langfuse via API'
    );

    // Fetch the dataset again to get the items with their run methods
    const dataset = await langfuse.getDataset(datasetId);
    if (!dataset || !dataset.items) {
      throw new Error(`Could not fetch dataset ${datasetId} for linking traces`);
    }

    // Create traces using the proper dataset run linking
    for (const result of results) {
      try {
        // Find the corresponding dataset item
        const datasetItem = dataset.items.find((item) => item.id === result.datasetItemId);
        if (!datasetItem) {
          logger.warn(
            {
              datasetItemId: result.datasetItemId,
            },
            'Dataset item not found for linking'
          );
          continue;
        }

        // Create trace and link it to the dataset run
        const trace = langfuse.trace({
          name: `Dataset Item: ${result.datasetItemId}`,
          input: result.input,
          output: result.output,
          metadata: {
            datasetItemId: result.datasetItemId,
            success: result.success,
            conversationId: result.metadata?.conversationId,
            iterations: result.metadata?.iterations,
            agentFramework: 'inkeep-agents',
            ...(result.error && { error: result.error }),
            ...metadata,
          },
          tags: ['dataset-run', 'agent-evaluation'].filter(Boolean),
        });

        // Link the trace to the dataset item and run
        if (datasetItem.link) {
          await datasetItem.link(trace, runName || 'dataset-evaluation', {
            description: `Agent evaluation run`,
            metadata: {
              agentFramework: 'inkeep-agents',
              ...metadata,
            },
          });
        }

        logger.debug(
          {
            datasetItemId: result.datasetItemId,
            traceId: trace.id,
          },
          'Created trace and linked to dataset run'
        );
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            datasetItemId: result.datasetItemId,
          },
          'Failed to create and link trace for dataset item'
        );
      }
    }

    // Flush to ensure all data is sent to Langfuse
    await langfuse.flushAsync();

    logger.info(
      {
        datasetId,
        tracesCreated: results.length,
      },
      'Successfully sent results to Langfuse'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        datasetId,
      },
      'Failed to send results to Langfuse'
    );
    throw error;
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}
