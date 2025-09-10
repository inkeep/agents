import * as readline from 'node:readline';
import chalk from 'chalk';
import ora from 'ora';
import { ExecutionApiClient, ManagementApiClient } from '../api';

export interface ChatOptions {
  url?: string;
  config?: string;
}

export async function chatCommand(graphId: string, options: ChatOptions) {
  const managementApi = await ManagementApiClient.create(options.url, options.config);
  const executionApi = await ExecutionApiClient.create(options.url, options.config);

  // Check if graph exists using management API
  const spinner = ora('Connecting to graph...').start();
  try {
    const graph = await managementApi.getGraph(graphId);
    if (!graph) {
      spinner.fail(`Graph "${graphId}" not found`);
      process.exit(1);
    }
    spinner.succeed(`Connected to graph: ${graph.name || graphId}`);
  } catch (error) {
    spinner.fail('Failed to connect to graph');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You> '),
  });

  // Generate a conversation ID for this session
  const conversationId = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const messages: any[] = [];

  console.log(chalk.gray('\n💬 Chat session started. Type "exit" or press Ctrl+C to quit.\n'));

  // Function to handle streaming response
  async function handleStreamingResponse(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = '';
    let responseContent = '';

    process.stdout.write(chalk.green('Assistant> '));

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // Debug logging
                if (process.env.DEBUG) {
                  console.error('Content received:', content);
                }
                // Filter out data operation JSON messages
                if (!content.startsWith('{"type":"data-operation"')) {
                  process.stdout.write(content);
                  responseContent += content;
                }
              }
            } catch (err) {
              // Log parse errors for debugging
              if (process.env.DEBUG) {
                console.error('Parse error:', err, 'Data:', data);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log('\n');
    return responseContent;
  }

  // Set up tab completion for graph IDs
  rl.on('line', async (input) => {
    const trimmedInput = input.trim();

    if (trimmedInput.toLowerCase() === 'exit') {
      console.log(chalk.gray('Goodbye! 👋'));
      rl.close();
      process.exit(0);
    }

    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    // Add user message to history
    messages.push({ role: 'user', content: trimmedInput });

    try {
      // Send message to API using execution API
      const response = await executionApi.chatCompletion(graphId, messages, conversationId);

      let assistantResponse: string;
      if (typeof response === 'string') {
        // Non-streaming response
        console.log(chalk.green('Assistant>'), response);
        assistantResponse = response;
      } else {
        // Streaming response
        assistantResponse = await handleStreamingResponse(response);
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: assistantResponse });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.gray('\nChat session ended.'));
    process.exit(0);
  });

  // Initial prompt
  rl.prompt();
}
