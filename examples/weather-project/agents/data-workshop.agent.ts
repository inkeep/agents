import { agent, subAgent, functionTool } from '@inkeep/agents-sdk';

/**
 * DATA WORKSHOP AGENT
 *
 * This agent contains various function tools for data processing, calculations, and utilities.
 *
 * USAGE PROMPTS TO TRY:
 * - "Generate an inspirational quote"
 * - "Tell me a programming joke"
 * - "Calculate BMI for someone 70kg and 1.75m tall"
 * - "Generate a secure password with 16 characters"
 * - "Analyze this text: 'I love this amazing product!'"
 * - "Convert $100 from USD to EUR"
 * - "Generate a QR code for 'https://example.com'"
 * - "Hash the text 'hello world' using SHA256"
 * - "Calculate my age if I was born on 1990-05-15"
 * - "Format 1234567.89 as currency"
 *
 * Each tool is designed to be easily invoked and provides clear, useful results.
 */

// Data fetching tools
const generateRandomQuote = functionTool({
  name: 'generate-quote',
  description: 'Generates a random inspirational quote from a curated collection',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => {
    const quotes = [
      { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
      { text: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
      {
        text: "Life is what happens to you while you're busy making other plans.",
        author: 'John Lennon',
      },
      {
        text: 'The future belongs to those who believe in the beauty of their dreams.',
        author: 'Eleanor Roosevelt',
      },
      {
        text: 'It is during our darkest moments that we must focus to see the light.',
        author: 'Aristotle',
      },
      { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
      {
        text: "Don't be afraid to give up the good to go for the great.",
        author: 'John D. Rockefeller',
      },
      {
        text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
        author: 'Winston Churchill',
      },
      { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
      { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
    ];

    const randomIndex = Math.floor(Math.random() * quotes.length);
    const selectedQuote = quotes[randomIndex];

    return {
      content: selectedQuote.text,
      author: selectedQuote.author,
      source: 'Curated Collection',
    };
  },
});

const fetchRandomJoke = functionTool({
  name: 'fetch-joke',
  description: 'Fetches a random programming joke',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  // Only needed if you want to use a particualr version of a package, otherwise it will scan your local version
  // dependencies: { axios: '^1.6.0' },
  execute: async () => {
    const axios = require('axios');
    const response = await axios.get(
      'https://official-joke-api.appspot.com/jokes/programming/random'
    );
    return {
      setup: response.data[0].setup,
      punchline: response.data[0].punchline,
    };
  },
});

// Calculation tools
const calculateBMI = functionTool({
  name: 'calculate-bmi',
  description: 'Calculates Body Mass Index (BMI) and provides health category',
  inputSchema: {
    type: 'object',
    properties: {
      weight: { type: 'number', description: 'Weight in kilograms' },
      height: { type: 'number', description: 'Height in meters' },
    },
    required: ['weight', 'height'],
  },
  execute: async (params: { weight: number; height: number }) => {
    const bmi = params.weight / (params.height * params.height);

    let category = '';
    if (bmi < 18.5) category = 'Underweight';
    else if (bmi < 25) category = 'Normal weight';
    else if (bmi < 30) category = 'Overweight';
    else category = 'Obese';

    return {
      weight: params.weight,
      height: params.height,
      bmi: Math.round(bmi * 10) / 10,
      category,
      healthAdvice:
        category === 'Normal weight'
          ? 'Maintain your current lifestyle'
          : 'Consider consulting a healthcare professional for personalized advice',
    };
  },
});

const generatePassword = functionTool({
  name: 'generate-password',
  description: 'Generates a secure random password with specified criteria',
  inputSchema: {
    type: 'object',
    properties: {
      length: { type: 'number', description: 'Password length (default: 12)', default: 12 },
      includeSymbols: {
        type: 'boolean',
        description: 'Include special symbols (default: true)',
        default: true,
      },
      includeNumbers: {
        type: 'boolean',
        description: 'Include numbers (default: true)',
        default: true,
      },
    },
    required: [],
  },
  // No external dependencies - uses built-in Node.js crypto module
  execute: async (params: {
    length?: number;
    includeSymbols?: boolean;
    includeNumbers?: boolean;
  }) => {
    const crypto = require('crypto');
    const length = params.length || 12;
    const includeSymbols = params.includeSymbols !== false;
    const includeNumbers = params.includeNumbers !== false;

    let charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }

    return {
      password,
      length,
      criteria: { includeSymbols, includeNumbers },
    };
  },
});

// Data processing tools
const analyzeText = functionTool({
  name: 'analyze-text',
  description: 'Analyzes text and provides statistics like word count, sentiment, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' },
    },
    required: ['text'],
  },
  // No external dependencies - uses built-in JavaScript methods
  execute: async (params: { text: string }) => {
    const words = params.text.split(/\s+/).filter((word) => word.length > 0);
    const sentences = params.text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const characters = params.text.length;
    const charactersNoSpaces = params.text.replace(/\s/g, '').length;

    // Simple sentiment analysis (very basic)
    const positiveWords = [
      'good',
      'great',
      'excellent',
      'amazing',
      'wonderful',
      'fantastic',
      'love',
      'like',
    ];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'horrible', 'worst'];

    const positiveCount = words.filter((word) =>
      positiveWords.some((pw) => word.toLowerCase().includes(pw))
    ).length;
    const negativeCount = words.filter((word) =>
      negativeWords.some((nw) => word.toLowerCase().includes(nw))
    ).length;

    let sentiment = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';

    // Count word frequencies without lodash
    const wordCounts: Record<string, number> = {};
    words.forEach((word: string) => {
      const lowerWord = word.toLowerCase();
      wordCounts[lowerWord] = (wordCounts[lowerWord] || 0) + 1;
    });

    // Get top 5 most common words
    const mostCommonWords: Record<string, number> = {};
    Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([word, count]) => {
        mostCommonWords[word] = count;
      });

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      characterCount: characters,
      characterCountNoSpaces: charactersNoSpaces,
      averageWordsPerSentence: Math.round((words.length / sentences.length) * 100) / 100,
      sentiment,
      mostCommonWords,
    };
  },
});

const convertCurrency = functionTool({
  name: 'convert-currency',
  description: 'Converts between different currencies using current exchange rates',
  inputSchema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to convert' },
      from: { type: 'string', description: 'Source currency code (e.g., USD)' },
      to: { type: 'string', description: 'Target currency code (e.g., EUR)' },
    },
    required: ['amount', 'from', 'to'],
  },
  execute: async (params: { amount: number; from: string; to: string }) => {
    const axios = require('axios');
    const response = await axios.get(
      `https://api.exchangerate-api.com/v4/latest/${params.from.toUpperCase()}`
    );
    const rate = response.data.rates[params.to.toUpperCase()];
    const convertedAmount = params.amount * rate;

    return {
      originalAmount: params.amount,
      fromCurrency: params.from.toUpperCase(),
      toCurrency: params.to.toUpperCase(),
      exchangeRate: rate,
      convertedAmount: Math.round(convertedAmount * 100) / 100,
    };
  },
});

// Utility tools
const generateQRCode = functionTool({
  name: 'generate-qr',
  description: 'Generates a QR code for given text or URL and renders as an image',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text or URL to encode in QR code' },
      size: { type: 'number', description: 'QR code size in pixels (default: 200)', default: 200 },
    },
    required: ['text'],
  },
  // No external dependencies - uses built-in fetch or axios
  execute: async (params: { text: string; size?: number }) => {
    const size = params.size || 200;
    const encodedText = encodeURIComponent(params.text);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}`;

    return {
      text: params.text,
      src: qrCodeUrl,
      size,
      note: 'QR code image is available at the provided src',
    };
  },
});

const hashText = functionTool({
  name: 'hash-text',
  description: 'Creates cryptoagentic hash of text using specified algorithm',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to hash' },
      algorithm: {
        type: 'string',
        description: 'Hash algorithm (default: sha256)',
        default: 'sha256',
      },
    },
    required: ['text'],
  },
  // No external dependencies - uses built-in Node.js crypto module
  execute: async (params: { text: string; algorithm?: string }) => {
    const crypto = require('crypto');
    const algorithm = params.algorithm || 'sha256';
    const hash = crypto.createHash(algorithm).update(params.text).digest('hex');

    return {
      text: params.text,
      algorithm,
      hash,
    };
  },
});

// Additional utility tools (no external dependencies)
const calculateAge = functionTool({
  name: 'calculate-age',
  description: 'Calculates age from birth date',
  inputSchema: {
    type: 'object',
    properties: {
      birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' },
    },
    required: ['birthDate'],
  },
  // No external dependencies - uses built-in Date methods
  execute: async (params: { birthDate: string }) => {
    const birth = new Date(params.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return {
      birthDate: params.birthDate,
      age,
      daysOld: Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24)),
    };
  },
});

const formatNumber = functionTool({
  name: 'format-number',
  description: 'Formats numbers with commas, currency, percentages, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      number: { type: 'number', description: 'Number to format' },
      type: {
        type: 'string',
        description: 'Format type: currency, percentage, comma, or decimal',
        default: 'comma',
      },
      currency: {
        type: 'string',
        description: 'Currency code for currency formatting (default: USD)',
        default: 'USD',
      },
      decimals: {
        type: 'number',
        description: 'Number of decimal places (default: 2)',
        default: 2,
      },
    },
    required: ['number'],
  },
  // No external dependencies - uses built-in Intl API
  execute: async (params: {
    number: number;
    type?: string;
    currency?: string;
    decimals?: number;
  }) => {
    const { number, type = 'comma', currency = 'USD', decimals = 2 } = params;

    let formatted: string;

    switch (type) {
      case 'currency':
        formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(number);
        break;
      case 'percentage':
        formatted = new Intl.NumberFormat('en-US', {
          style: 'percent',
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(number / 100);
        break;
      case 'decimal':
        formatted = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(number);
        break;
      default: // comma
        formatted = new Intl.NumberFormat('en-US').format(number);
    }

    return {
      original: number,
      formatted,
      type,
      currency: type === 'currency' ? currency : undefined,
    };
  },
});

// Create the data workshop agent
const dataWorkshopSubAgent = subAgent({
  id: 'data-workshop-sub-agent',
  name: 'data-workshop-agent',
  description:
    'A comprehensive data processing and utility agent with tools for calculations, data fetching, text analysis, and more',
  prompt: `You are a data workshop assistant with access to various tools for:
- Fetching data from APIs (quotes, jokes, exchange rates)
- Performing calculations (BMI, password generation)
- Analyzing and processing text
- Converting between currencies
- Generating QR codes and rendering as an image through the src property
- Hashing text
- And many other utility functions

Use these tools to help users with their data processing needs, calculations, and various utility tasks. Always explain what you're doing and provide clear results.`,
  canUse: () => [
    generateRandomQuote,
    fetchRandomJoke,
    calculateBMI,
    generatePassword,
    analyzeText,
    convertCurrency,
    generateQRCode,
    hashText,
    calculateAge,
    formatNumber,
  ],
});

// Create the data workshop agent
export const dataWorkshopAgent = agent({
  id: 'data-workshop-agent',
  name: 'Data Workshop Agent',
  defaultSubAgent: dataWorkshopSubAgent,
  subAgents: () => [dataWorkshopSubAgent],
});
