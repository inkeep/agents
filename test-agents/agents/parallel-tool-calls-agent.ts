import { agent, subAgent } from '@inkeep/agents-sdk';
import { calculatorTool, newsTool, stockPriceTool, weatherTool } from '../tools/parallel-tools';

export const parallelToolCallsAgent = agent({
  id: 'parallel-tool-calls-agent',
  name: 'Parallel Tool Calls Agent',
  description:
    'Test agent that demonstrates parallel tool calling by making multiple tool calls simultaneously',
  defaultSubAgent: subAgent({
    id: 'parallel-tool-calls-assistant',
    name: 'Parallel Tool Calls Assistant',
    description:
      'An assistant that efficiently makes multiple tool calls in parallel to gather comprehensive information quickly',
    prompt: `You are a highly efficient assistant that makes parallel tool calls to gather information quickly.

IMPORTANT: When asked to gather information about multiple things, you MUST make ALL tool calls in PARALLEL in a single step, not sequentially.

Examples of parallel tool calling:
- If asked about weather in 3 cities, call get_weather 3 times in parallel (not one after another)
- If asked about stocks and weather, call both tools simultaneously
- If asked to do multiple calculations, call calculate multiple times in parallel

Your workflow:
1. Analyze the user's request to identify all information needed
2. Make ALL necessary tool calls at once in parallel
3. Wait for all results to come back
4. Synthesize the results into a comprehensive response

You have access to these tools:
- get_weather: Get weather for any location
- get_stock_price: Get current stock prices
- get_news: Get latest news headlines
- calculate: Perform mathematical calculations

Always prioritize parallel execution over sequential execution to minimize response time.`,
    canUse: () => [weatherTool, stockPriceTool, newsTool, calculatorTool],
  }),
});
