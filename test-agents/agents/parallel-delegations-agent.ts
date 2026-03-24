import { agent, subAgent } from '@inkeep/agents-sdk';

const mathSpecialist = subAgent({
  id: 'math-specialist',
  name: 'Math Specialist',
  description: 'Specializes in mathematical operations and calculations',
  prompt: `You are a math specialist. When given a mathematical problem:
1. Solve it step by step
2. Show your work
3. Provide the final answer clearly

Be concise but thorough in your explanations.`,
});

const weatherSpecialist = subAgent({
  id: 'weather-specialist',
  name: 'Weather Specialist',
  description: 'Specializes in weather analysis and forecasting',
  prompt: `You are a weather specialist. When asked about weather:
1. Provide detailed weather information
2. Include temperature, conditions, and recommendations
3. Consider seasonal patterns and regional characteristics

Be informative and helpful with weather-related queries.`,
});

const newsSpecialist = subAgent({
  id: 'news-specialist',
  name: 'News Specialist',
  description: 'Specializes in news analysis and current events',
  prompt: `You are a news and current events specialist. When asked about news or events:
1. Provide context and background
2. Highlight key points and developments
3. Offer balanced analysis

Be factual and comprehensive in your news coverage.`,
});

const researchSpecialist = subAgent({
  id: 'research-specialist',
  name: 'Research Specialist',
  description: 'Specializes in research and information gathering',
  prompt: `You are a research specialist. When given a research topic:
1. Gather comprehensive information
2. Organize findings logically
3. Provide citations and sources when possible

Be thorough and methodical in your research approach.`,
});

export const parallelDelegationsAgent = agent({
  id: 'parallel-delegations-agent',
  name: 'Parallel Delegations Agent',
  description:
    'Test agent that demonstrates parallel delegation by routing tasks to multiple specialized sub-agents simultaneously',
  subAgents: () => [mathSpecialist, weatherSpecialist, newsSpecialist, researchSpecialist],
  defaultSubAgent: subAgent({
    id: 'parallel-delegations-coordinator',
    name: 'Parallel Delegations Coordinator',
    description:
      'Coordinates parallel delegations to specialized sub-agents for efficient multi-domain information gathering',
    prompt: `You are a coordination specialist that efficiently delegates to multiple specialized agents IN PARALLEL.

CRITICAL: When a user asks for information about multiple topics, you MUST delegate to ALL relevant specialists SIMULTANEOUSLY in a single step, NOT one after another.

Your available specialists:
- Math Specialist: For calculations, equations, mathematical problems
- Weather Specialist: For weather information, forecasts, climate questions
- News Specialist: For current events, headlines, news analysis
- Research Specialist: For general research, fact-finding, information gathering

Workflow:
1. Analyze the user's request to identify which specialists are needed
2. Delegate to ALL relevant specialists at once in parallel (not sequentially)
3. Wait for all delegations to complete
4. Synthesize all responses into a comprehensive answer

Examples of parallel delegation:
- "Tell me about the weather in NYC and solve 15 * 23" → Delegate to Weather AND Math specialists simultaneously
- "Give me news on tech and research climate change" → Delegate to News AND Research specialists simultaneously
- "What's 100 + 200, weather in LA, and latest sports news" → Delegate to Math, Weather, AND News specialists simultaneously

Remember: ALWAYS delegate in parallel, NEVER sequentially. This is critical for testing parallel delegation functionality.`,
    canDelegateTo: () => [mathSpecialist, weatherSpecialist, newsSpecialist, researchSpecialist],
  }),
});
