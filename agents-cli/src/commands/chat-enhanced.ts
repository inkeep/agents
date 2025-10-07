import * as readline from 'node:readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { ExecutionApiClient, ManagementApiClient } from '../api';
import { initializeCommand } from '../utils/cli-pipeline';

export interface ChatOptions {
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

export async function chatCommandEnhanced(graphIdInput?: string, options?: ChatOptions) {
  console.log(chalk.cyan('🤖 Inkeep Chat Interface\n'));

  // Use standardized CLI pipeline for initialization
  const configPath = options?.config || options?.configFilePath;
  const { config } = await initializeCommand({
    configPath,
    showSpinner: false,
    logConfig: true,
  });

  console.log();

  const managementApi = await ManagementApiClient.create(
    config.agentsManageApiUrl,
    configPath,
    config.tenantId
  );
  const executionApi = await ExecutionApiClient.create(
    config.agentsRunApiUrl,
    configPath,
    config.tenantId
  );

  let graphId = graphIdInput;

  // If no graph ID provided, show autocomplete selection
  if (!graphId) {
    const spinner = ora('Fetching available graphs...').start();
    try {
      const graphs = await managementApi.listGraphs();
      spinner.stop();

      if (graphs.length === 0) {
        console.error(
          chalk.red('No graphs available. Define graphs in your project and run: inkeep push')
        );
        process.exit(1);
      }

      // Create searchable source for autocomplete
      const graphChoices = graphs.map((g) => ({
        name: `${chalk.cyan(g.id)} - ${g.name || 'Unnamed Graph'}`,
        value: g.id,
        short: g.id,
        searchText: `${g.id} ${g.name || ''}`.toLowerCase(),
      }));

      // Use list prompt for interactive selection
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'graphId',
          message: 'Select a graph to chat with:',
          choices: graphChoices,
          pageSize: 10,
        },
      ]);

      graphId = answer.graphId;
    } catch (error) {
      spinner.fail('Failed to fetch graphs');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Check if graph exists
  const spinner = ora('Connecting to graph...').start();
  try {
    if (!graphId) {
      throw new Error('No graph selected');
    }
    const graph = await managementApi.getGraph(graphId);
    if (!graph) {
      spinner.fail(`Graph "${graphId}" not found`);

      // Show available graphs
      const graphs = await managementApi.listGraphs();
      if (graphs.length > 0) {
        console.log(chalk.yellow('\nAvailable graphs:'));
        graphs.forEach((g) => {
          console.log(chalk.gray(`  • ${g.id} - ${g.name || 'Unnamed'}`));
        });
        console.log(chalk.gray('\nRun "inkeep chat" without arguments for interactive selection'));
      } else {
        console.log(chalk.yellow('\nNo graphs found. Please define graphs and push your project.'));
      }
      process.exit(1);
    }
    spinner.succeed(`Connected to graph: ${chalk.green(graph.name || graphId)}`);

    // Display graph details
    if (graph.description) {
      console.log(chalk.gray(`Description: ${graph.description}`));
    }
    if (graph.defaultSubAgentId || graph.default_agent_id) {
      console.log(
        chalk.gray(`Default Agent: ${graph.defaultSubAgentId || graph.default_agent_id}`)
      );
    }
  } catch (error) {
    spinner.fail('Failed to connect to graph');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Create readline interface for chat
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You> '),
  });

  // Generate a conversation ID for this session
  const conversationId = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const messages: any[] = [];
  let emitOperations = false;

  console.log(chalk.gray('\n💬 Chat session started. Type "exit" or press Ctrl+C to quit.'));
  console.log(chalk.gray('Commands: help, clear, history, reset, operations\n'));

  // Function to handle streaming response
  async function handleStreamingResponse(
    stream: ReadableStream<Uint8Array>,
    showDebug: boolean = false
  ) {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = '';
    let responseContent = '';
    const debugOperations: any[] = [];
    let hasStartedResponse = false;

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

              // Handle OpenAI-style streaming chunks
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // Process content character by character to extract JSON objects
                let currentPos = 0;
                while (currentPos < content.length) {
                  // Check if we're at the start of a JSON data operation
                  if (content.substring(currentPos).startsWith('{"type":"data-operation"')) {
                    // Find the matching closing brace
                    let braceCount = 0;
                    let jsonEnd = currentPos;
                    for (let i = currentPos; i < content.length; i++) {
                      if (content[i] === '{') braceCount++;
                      if (content[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                          jsonEnd = i + 1;
                          break;
                        }
                      }
                    }

                    // Extract and parse the JSON object
                    const jsonStr = content.substring(currentPos, jsonEnd);
                    try {
                      const dataOp = JSON.parse(jsonStr);
                      debugOperations.push(dataOp);

                      // Show debug info if enabled
                      if (showDebug && dataOp.type === 'data-operation') {
                        const opType = dataOp.data?.type || 'unknown';
                        const label = dataOp.data?.label || 'Unknown operation';
                        const details = dataOp.data?.details || {};
                        const agentId = details.agentId || 'unknown-agent';

                        // Format display based on operation type
                        let displayText = '';
                        if (opType === 'completion') {
                          displayText = `${label} (agent: ${agentId})`;
                        } else if (opType === 'tool_execution') {
                          const toolData = details.data || {};
                          displayText = `${label} - ${toolData.toolName || 'unknown tool'}`;
                        } else if (opType === 'agent_generate' || opType === 'agent_reasoning') {
                          displayText = `${label}`;
                        } else {
                          displayText = `${label} (${agentId})`;
                        }

                        // Add newline before completion operations that come after text
                        if (opType === 'completion' && hasStartedResponse) {
                          console.log(''); // Add newline before completion
                        }
                        console.log(chalk.gray(`  [${opType}] ${displayText}`));
                      }

                      currentPos = jsonEnd;
                    } catch {
                      // Failed to parse, treat as regular content
                      if (!hasStartedResponse) {
                        process.stdout.write(chalk.green('Assistant> '));
                        hasStartedResponse = true;
                      }
                      process.stdout.write(content[currentPos]);
                      responseContent += content[currentPos];
                      currentPos++;
                    }
                  } else {
                    // Regular text content
                    if (!hasStartedResponse) {
                      process.stdout.write(chalk.green('Assistant> '));
                      hasStartedResponse = true;
                    }
                    process.stdout.write(content[currentPos]);
                    responseContent += content[currentPos];
                    currentPos++;
                  }
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add final newline if we had content
    if (hasStartedResponse) {
      console.log('\n');
    } else {
      console.log(`${chalk.green('Assistant> ') + chalk.gray('(no response)')}\n`);
    }

    return responseContent;
  }

  // Handle user input
  rl.on('line', async (input) => {
    const trimmedInput = input.trim();
    const command = trimmedInput.toLowerCase().replace(/^\//, '');

    if (command === 'exit') {
      console.log(chalk.gray('Goodbye! 👋'));
      rl.close();
      process.exit(0);
    }

    if (command === 'clear') {
      console.clear();
      console.log(chalk.gray('Screen cleared. Conversation context preserved.\n'));
      rl.prompt();
      return;
    }

    if (command === 'help') {
      console.log(chalk.cyan('\n📚 Available commands:'));
      console.log(chalk.gray('  • exit     - End the chat session'));
      console.log(chalk.gray('  • clear    - Clear the screen (preserves context)'));
      console.log(chalk.gray('  • history  - Show conversation history'));
      console.log(chalk.gray('  • reset    - Reset conversation context'));
      console.log(
        chalk.gray('  • operations - Toggle emit operations (show/hide data operations)')
      );
      console.log(chalk.gray('  • help     - Show this help message'));
      console.log(chalk.gray('\n  Commands can be prefixed with / (e.g., /help)\n'));
      rl.prompt();
      return;
    }

    if (command === 'operations') {
      emitOperations = !emitOperations;
      console.log(chalk.yellow(`\n🔧 Data operations: ${emitOperations ? 'ON' : 'OFF'}`));
      if (emitOperations) {
        console.log(chalk.gray('Data operations will be shown during responses.\n'));
      } else {
        console.log(chalk.gray('Data operations are hidden.\n'));
      }
      rl.prompt();
      return;
    }

    if (command === 'history') {
      console.log(chalk.cyan('\n📜 Conversation History:'));
      if (messages.length === 0) {
        console.log(chalk.gray('  (No messages yet)\n'));
      } else {
        messages.forEach((msg, idx) => {
          const role = msg.role === 'user' ? chalk.blue('You') : chalk.green('Assistant');
          const preview = msg.content.substring(0, 100);
          const suffix = msg.content.length > 100 ? '...' : '';
          console.log(`  ${idx + 1}. ${role}: ${preview}${suffix}`);
        });
        console.log();
      }
      rl.prompt();
      return;
    }

    if (command === 'reset') {
      messages.length = 0;
      console.log(chalk.yellow('⚠️  Conversation context has been reset.\n'));
      rl.prompt();
      return;
    }

    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    // Add user message to history
    messages.push({ role: 'user', content: trimmedInput });

    try {
      // Send message to API using execution API
      if (!graphId) throw new Error('No graph selected');
      const response = await executionApi.chatCompletion(
        graphId,
        messages,
        conversationId,
        emitOperations
      );

      let assistantResponse: string;
      if (typeof response === 'string') {
        // Non-streaming response
        console.log(chalk.green('Assistant>'), response);
        assistantResponse = response;
      } else {
        // Streaming response
        assistantResponse = await handleStreamingResponse(response, emitOperations);
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: assistantResponse });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.gray('\n📊 Session Summary:'));
    console.log(chalk.gray(`  • Graph: ${graphId}`));
    console.log(chalk.gray(`  • Messages: ${messages.length}`));
    console.log(chalk.gray(`  • Duration: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray('\nChat session ended.'));
    process.exit(0);
  });

  // Initial prompt
  rl.prompt();
}
