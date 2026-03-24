import { functionTool } from '@inkeep/agents-sdk';

export const weatherTool = functionTool({
  name: 'get_weather',
  description: 'Get the weather for a specific location',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The location to get weather for',
      },
    },
    required: ['location'],
  },
  execute: async ({ location }) => {
    return {
      location,
      temperature: Math.floor(Math.random() * 30) + 50,
      conditions: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 50) + 30,
    };
  },
});

export const stockPriceTool = functionTool({
  name: 'get_stock_price',
  description: 'Get the current stock price for a company',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'The stock symbol (e.g., AAPL, GOOGL)',
      },
    },
    required: ['symbol'],
  },
  execute: async ({ symbol }) => {
    return {
      symbol,
      price: Math.floor(Math.random() * 500) + 100,
      change: (Math.random() * 10 - 5).toFixed(2),
      volume: Math.floor(Math.random() * 10000000),
    };
  },
});

export const newsTool = functionTool({
  name: 'get_news',
  description: 'Get the latest news headlines for a topic',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The topic to get news for',
      },
    },
    required: ['topic'],
  },
  execute: async ({ topic }) => {
    return {
      topic,
      headlines: [
        `Breaking: ${topic} sees major development`,
        `Experts weigh in on ${topic}`,
        `${topic}: What you need to know today`,
      ],
      count: 3,
    };
  },
});

export const calculatorTool = functionTool({
  name: 'calculate',
  description: 'Perform a mathematical calculation',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: 'The operation to perform',
        enum: ['add', 'subtract', 'multiply', 'divide'],
      },
      a: {
        type: 'number',
        description: 'First number',
      },
      b: {
        type: 'number',
        description: 'Second number',
      },
    },
    required: ['operation', 'a', 'b'],
  },
  execute: async ({ operation, a, b }) => {
    let result: number;
    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        result = b !== 0 ? a / b : 0;
        break;
      default:
        result = 0;
    }
    return {
      operation,
      a,
      b,
      result,
    };
  },
});
