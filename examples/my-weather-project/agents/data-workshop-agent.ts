import { agent, functionTool, subAgent } from '@inkeep/agents-sdk';
import { fdxgfv9HL7SXlfynPx8hf } from '../tools/fdxgfv9HL7SXlfynPx8hf';
import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/fUI2riwrBVJ6MepT8rjx0';

const analyzeText = functionTool({
  name: 'analyze-text',
  description: 'Analyzes text and provides insights',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze'
      }
    },
    required: ['text']
  },
  execute: async (params: { text: string }) => {
    try {
      const text = params.text;
      const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
      const charCount = text.length;
      const charCountNoSpaces = text.replace(/\s/g, '').length;
      const sentenceCount = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;
      const avgWordsPerSentence = sentenceCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;
      
      return {
        wordCount,
        charCount,
        charCountNoSpaces,
        sentenceCount,
        avgWordsPerSentence,
        readingTime: Math.ceil(wordCount / 200)
      };
    } catch (error: any) {
      throw new Error(`Text analysis failed: ${error.message}`);
    }
  }
});

const calculateAge = functionTool({
  name: 'calculate-age',
  description: 'Calculates age from birth date',
  inputSchema: {
    type: 'object',
    properties: {
      birthDate: {
        type: 'string',
        description: 'Birth date in YYYY-MM-DD format'
      }
    },
    required: ['birthDate']
  },
  execute: async (params: { birthDate: string }) => {
    try {
      const birth = new Date(params.birthDate);
      const today = new Date();
      
      if (birth > today) {
        throw new Error('Birth date cannot be in the future');
      }
      
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      
      return { age };
    } catch (error: any) {
      throw new Error(`Age calculation failed: ${error.message}`);
    }
  }
});

const calculateBmi = functionTool({
  name: 'calculate-bmi',
  description: 'Calculates BMI from weight and height',
  inputSchema: {
    type: 'object',
    properties: {
      weight: {
        type: 'number',
        description: 'Weight in kilograms'
      },
      height: {
        type: 'number',
        description: 'Height in meters'
      }
    },
    required: ['weight', 'height']
  },
  execute: async (params: { weight: number; height: number }) => {
    try {
      if (params.weight <= 0 || params.height <= 0) {
        throw new Error('Weight and height must be positive numbers');
      }
      
      const bmi = params.weight / (params.height * params.height);
      let category = '';
      
      if (bmi < 18.5) category = 'Underweight';
      else if (bmi < 25) category = 'Normal weight';
      else if (bmi < 30) category = 'Overweight';
      else category = 'Obese';
      
      return {
        bmi: Math.round(bmi * 10) / 10,
        category
      };
    } catch (error: any) {
      throw new Error(`BMI calculation failed: ${error.message}`);
    }
  }
});

const convertCurrency = functionTool({
  name: 'convert-currency',
  description: 'Converts currency amounts using live exchange rates',
  inputSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount to convert'
      },
      from: {
        type: 'string',
        description: 'Source currency code (e.g., USD)'
      },
      to: {
        type: 'string',
        description: 'Target currency code (e.g., EUR)'
      }
    },
    required: ['amount', 'from', 'to']
  },
  execute: async (params: { amount: number; from: string; to: string }) => {
    try {
      const axios = require('axios');
      const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${params.from.toUpperCase()}`);
      const rate = response.data.rates[params.to.toUpperCase()];
      
      if (!rate) {
        throw new Error(`Exchange rate not found for ${params.to}`);
      }
      
      const convertedAmount = params.amount * rate;
      
      return {
        originalAmount: params.amount,
        originalCurrency: params.from.toUpperCase(),
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        targetCurrency: params.to.toUpperCase(),
        exchangeRate: rate
      };
    } catch (error: any) {
      throw new Error(`Currency conversion failed: ${error.message}`);
    }
  }
});

const fetchJoke = functionTool({
  name: 'fetch-joke',
  description: 'Fetches a random programming joke',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    try {
      const axios = require('axios');
      const response = await axios.get('https://official-joke-api.appspot.com/jokes/programming/random');
      const joke = response.data[0];
      
      return {
        setup: joke.setup,
        punchline: joke.punchline,
        type: joke.type
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch joke: ${error.message}`);
    }
  }
});

const formatNumber = functionTool({
  name: 'format-number',
  description: 'Formats numbers in various styles',
  inputSchema: {
    type: 'object',
    properties: {
      number: {
        type: 'number',
        description: 'Number to format'
      },
      type: {
        type: 'string',
        description: 'Format type: currency, percentage, comma, or decimal',
        default: 'comma'
      },
      currency: {
        type: 'string',
        description: 'Currency code for currency formatting (default: USD)',
        default: 'USD'
      },
      decimals: {
        type: 'number',
        description: 'Number of decimal places (default: 2)',
        default: 2
      }
    },
    required: ['number']
  },
  execute: async (params: { number: number; type?: string; currency?: string; decimals?: number }) => {
    try {
      const { number, type = 'comma', currency = 'USD', decimals = 2 } = params;
      let formatted = '';
      
      switch (type) {
        case 'currency':
          formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(number);
          break;
        case 'percentage':
          formatted = new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(number / 100);
          break;
        case 'decimal':
          formatted = number.toFixed(decimals);
          break;
        default:
          formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(number);
      }
      
      return { formatted };
    } catch (error: any) {
      throw new Error(`Number formatting failed: ${error.message}`);
    }
  }
});

const generatePassword = functionTool({
  name: 'generate-password',
  description: 'Generates a secure random password with specified criteria',
  inputSchema: {
    type: 'object',
    properties: {
      length: {
        type: 'number',
        description: 'Password length (default: 12)',
        default: 12
      },
      includeSymbols: {
        type: 'boolean',
        description: 'Include special symbols (default: true)',
        default: true
      },
      includeNumbers: {
        type: 'boolean',
        description: 'Include numbers (default: true)',
        default: true
      }
    },
    required: []
  },
  execute: async (params: { length?: number; includeSymbols?: boolean; includeNumbers?: boolean }) => {
    try {
      const crypto = require('crypto');
      const { length = 12, includeSymbols = true, includeNumbers = true } = params;
      
      let charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (includeNumbers) charset += '0123456789';
      if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      let password = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, charset.length);
        password += charset[randomIndex];
      }
      
      return { password };
    } catch (error: any) {
      throw new Error(`Password generation failed: ${error.message}`);
    }
  }
});

const generateQr = functionTool({
  name: 'generate-qr',
  description: 'Generates a QR code for text or URLs',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text or URL to encode in QR code'
      },
      size: {
        type: 'number',
        description: 'QR code size in pixels (default: 200)',
        default: 200
      }
    },
    required: ['text']
  },
  execute: async (params: { text: string; size?: number }) => {
    try {
      const { text, size = 200 } = params;
      const encodedText = encodeURIComponent(text);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}`;
      
      return {
        qrCodeUrl: qrUrl,
        text: text,
        size: size
      };
    } catch (error: any) {
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }
});

const generateQuote = functionTool({
  name: 'generate-quote',
  description: 'Generates an inspirational quote',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    try {
      const quotes = [
        { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
        { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
        { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
        { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
        { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
        { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" }
      ];
      
      const randomIndex = Math.floor(Math.random() * quotes.length);
      const selectedQuote = quotes[randomIndex];
      
      return {
        quote: selectedQuote.text,
        author: selectedQuote.author
      };
    } catch (error: any) {
      throw new Error(`Quote generation failed: ${error.message}`);
    }
  }
});

const hashText = functionTool({
  name: 'hash-text',
  description: 'Generates hash of text using specified algorithm',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to hash'
      },
      algorithm: {
        type: 'string',
        description: 'Hash algorithm (default: sha256)',
        default: 'sha256'
      }
    },
    required: ['text']
  },
  execute: async (params: { text: string; algorithm?: string }) => {
    try {
      const crypto = require('crypto');
      const { text, algorithm = 'sha256' } = params;
      
      const hash = crypto.createHash(algorithm).update(text).digest('hex');
      
      return {
        originalText: text,
        hash: hash,
        algorithm: algorithm
      };
    } catch (error: any) {
      throw new Error(`Text hashing failed: ${error.message}`);
    }
  }
});

const dataWorkshopSubAgent = subAgent({
  id: 'data-workshop-sub-agent',
  name: 'data-workshop-agent',
  description: `A versatile data workshop assistant that helps with various utility functions and data processing tasks.`,
  prompt: `You are a helpful data workshop assistant with access to various utility tools. You can help users with:

- Text analysis and processing
- Mathematical calculations (BMI, age calculation)
- Data formatting and conversion
- Password generation and security
- QR code generation
- Currency conversion
- Entertainment (jokes and quotes)
- Text hashing and cryptographic functions

Always be helpful, accurate, and provide clear explanations of what you're doing. When using tools, explain the results in a user-friendly way.`,
  canUse: () => [
    analyzeText,
    calculateAge,
    calculateBmi,
    convertCurrency,
    fetchJoke,
    formatNumber,
    generatePassword,
    generateQr,
    generateQuote,
    hashText,
    fdxgfv9HL7SXlfynPx8hf,
    fUI2riwrBVJ6MepT8rjx0
  ],
  canDelegateTo: () => [],
  dataComponents: () => []
});

export const dataWorkshopAgent = agent({
  id: 'data-workshop-agent',
  name: 'Data Workshop Agent',
  defaultSubAgent: dataWorkshopSubAgent,
  subAgents: () => [dataWorkshopSubAgent]
});