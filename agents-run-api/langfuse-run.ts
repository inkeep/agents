#!/usr/bin/env tsx

import { Langfuse } from 'langfuse';
import { getLogger } from './src/logger.js';

const logger = getLogger('langfuse-dataset-runner');

interface RunConfig {
  datasetId: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  agentId?: string;
  runName?: string;
  runDescription?: string;
  baseUrl?: string;
  apiKey?: string;
  metadata?: Record<string, any>;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: pnpm langfuse:dataset [options]

Options:
  --dataset-id <id>         Langfuse dataset ID (required)
  --tenant-id <id>          Tenant ID (required)
  --project-id <id>         Project ID (required)
  --graph-id <id>           Graph ID (required)
  --agent-id <id>           Specific agent ID (optional, uses default agent if not provided)
  --run-name <name>         Name for the evaluation run (optional)
  --run-description <desc>  Description for the evaluation run (optional)
  --base-url <url>          Base URL for the agents API (optional, default: http://localhost:3002)
  --api-key <key>           API key for authentication (optional, can use INKEEP_API_KEY env var)
  --help, -h                Show this help message

Environment Variables:
  LANGFUSE_PUBLIC_KEY       Langfuse public key
  LANGFUSE_SECRET_KEY       Langfuse secret key
  LANGFUSE_BASE_URL         Langfuse base URL (default: https://us.cloud.langfuse.com)
  INKEEP_API_KEY            Inkeep API key for authentication (alternative to --api-key)

Example:
  pnpm langfuse:dataset \\
    --dataset-id "clm123abc" \\
    --tenant-id "tenant_123" \\
    --project-id "proj_456" \\
    --graph-id "graph_789" \\
    --base-url "http://localhost:3003" \\
    --api-key "your-api-key" \\
    --run-name "Agent Evaluation v1.2"
`);
    process.exit(0);
  }

  // Parse command line arguments
  const config: Partial<RunConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--dataset-id':
        config.datasetId = value;
        break;
      case '--tenant-id':
        config.tenantId = value;
        break;
      case '--project-id':
        config.projectId = value;
        break;
      case '--graph-id':
        config.graphId = value;
        break;
      case '--agent-id':
        config.agentId = value;
        break;
      case '--run-name':
        config.runName = value;
        break;
      case '--run-description':
        config.runDescription = value;
        break;
      case '--base-url':
        config.baseUrl = value;
        break;
      case '--api-key':
        config.apiKey = value;
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
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
  const {
    datasetId,
    tenantId,
    projectId,
    graphId,
    agentId,
    runName,
    runDescription,
    baseUrl,
    apiKey,
    metadata,
  } = config;

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

  const chatBaseUrl = baseUrl || 'http://localhost:3002';

  // Generate a unique run ID
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

  logger.info({ runId, chatBaseUrl }, 'Starting dataset evaluation run');

  // Process the dataset
  await processDatasetRun({
    runId,
    datasetId,
    runName,
    runDescription,
    metadata,
    chatBaseUrl,
    authKey,
    agentId,
    tenantId,
    projectId,
    graphId,
  });

  logger.info({ runId }, 'Dataset evaluation completed');
}

// Helper function to process the dataset run using chat API
async function processDatasetRun({
  runId,
  datasetId,
  runName,
  runDescription,
  metadata,
  chatBaseUrl,
  authKey,
  agentId,
  tenantId,
  projectId,
  graphId,
}: {
  runId: string;
  datasetId: string;
  runName?: string;
  runDescription?: string;
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
      runId,
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
        executionTime?: number;
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
        const conversationId = `dataset_${runId}_item_${i}_${item.id}`;

        // Run the dataset item through the chat API
        const result = await runDatasetItemThroughChatAPI({
          conversationId,
          userMessage,
          agentId,
          datasetItem: item,
          runId,
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
            executionTime: result.executionTime,
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
      runId,
      runName,
      runDescription,
      results,
      metadata,
    });

    logger.info(
      {
        runId,
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
        runId,
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
    let items = dataset.items;
    if (!items) {
      // Try to fetch items separately if not included in the dataset response
      logger.info({ datasetId }, 'Dataset items not included, fetching separately...');
      try {
        // Note: This might require a different API call depending on Langfuse SDK version
        // items = await langfuse.getDatasetItems(datasetId);
        items = [];
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to fetch dataset items separately'
        );
        items = [];
      }
    }

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
  runId: _runId,
  chatBaseUrl,
  authKey,
  executionContext,
  _datasetId,
}: {
  conversationId: string;
  userMessage: string;
  agentId?: string;
  datasetItem: any;
  runId: string;
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
  executionTime?: number;
  traceId?: string;
}> {
  const startTime = Date.now();

  try {
    // Prepare the chat request payload
    const chatPayload = {
      model: 'gpt-4', // Required field for the chat completions API
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      conversationId,
      ...(agentId && { agentId }),
    };

    // Make request to chat endpoint
    const response = await fetch(`${chatBaseUrl}/v1/chat/completions`, {
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

    const executionTime = Date.now() - startTime;

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
        executionTime,
      };
    }

    const responseText = await response.text();
    logger.info({ responseText }, 'Response text');
    const assistantResponse = parseSSEResponse(responseText);

    return {
      success: true,
      response: assistantResponse || 'No response generated',
      iterations: 1, // Simple chat API call
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
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
      executionTime,
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
        if (data.choices?.[0]?.delta?.content) {
          const content = data.choices[0].delta.content;
          // Filter out system metadata messages (data-operation type messages)
          if (content.includes('"type":"data-operation"')) {
            continue;
          }
          assistantResponse += content;
        }
      } catch {
      }
    }
  }

  return assistantResponse.trim();
}

// Helper function to send results back to Langfuse
async function sendResultsToLangfuse({
  datasetId,
  runId,
  runName,
  runDescription,
  results,
  metadata,
}: {
  datasetId: string;
  runId: string;
  runName?: string;
  runDescription?: string;
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
        runId,
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
            executionTime: result.metadata?.executionTime,
            agentFramework: 'inkeep-agents',
            ...(result.error && { error: result.error }),
            ...metadata,
          },
          tags: ['dataset-run', 'agent-evaluation'].filter(Boolean),
        });

        // Link the trace to the dataset item and run
        if (datasetItem.link) {
          await datasetItem.link(trace, runName || runId, {
            description: runDescription || `Agent evaluation run: ${runId}`,
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
        runId,
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
        runId,
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
