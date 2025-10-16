import { agent, functionTool, subAgent } from '@inkeep/agents-sdk';
import { forecastWeather } from '../tools/forecast-weather';
import { geocodeAddress } from '../tools/geocode-address';

const hashText = functionTool({
  name: 'hash-text',
  description: 'Hashes text using specified algorithm',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to hash' },
      algorithm: { type: 'string', description: 'Hash algorithm (default: sha256)', default: 'sha256' }
    },
    required: ['text']
  },
  execute: async (params: { text: string; algorithm?: string }) => {
    try {
      const crypto = require('crypto');
      const algorithm = params.algorithm || 'sha256';
      const hash = crypto.createHash(algorithm).update(params.text).digest('hex');
      return { hash };
    } catch (error: any) {
      throw new Error(`Hash generation failed: ${error.message}`);
    }
  }
});

const generateQr = functionTool({
  name: 'generate-qr',
  description: 'Generates a QR code for text or URL',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text or URL to encode in QR code' },
      size: { type: 'number', description: 'QR code size in pixels (default: 200)', default: 200 }
    },
    required: ['text']
  },
  execute: async (params: { text: string; size?: number }) => {
    try {
      const size = params.size || 200;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(params.text)}`;
      return { qrUrl, text: params.text, size };
    } catch (error: any) {
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }
});

const analyzeText = functionTool({
  name: 'analyze-text',
  description: 'Analyzes text and provides insights',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' }
    },
    required: ['text']
  },
  execute: async (params: { text: string }) => {
    try {
      const wordCount = params.text.split(/\s+/).filter(word => word.length > 0).length;
      const charCount = params.text.length;
      const sentenceCount = params.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
      const avgWordLength = charCount / (wordCount || 1);
      
      return {
        wordCount,
        charCount,
        sentenceCount,
        avgWordLength: Math.round(avgWordLength * 10) / 10
      };
    } catch (error: any) {
      throw new Error(`Text analysis failed: ${error.message}`);
    }
  }
});

const fetchJoke = functionTool({
  name: 'fetch-joke',
  description: 'Fetches a random programming joke',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    try {
      const axios = require('axios');
      const response = await axios.get('https://official-joke-api.appspot.com/jokes/programming/random');
      const joke = response.data[0];
      return {
        setup: joke.setup,
        punchline: joke.punchline
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch joke: ${error.message}`);
    }
  }
});

const generatePassword = functionTool({
  name: 'generate-password',
  description: 'Generates a secure random password with specified criteria',
  inputSchema: {
    type: 'object',
    properties: {
      length: { type: 'number', description: 'Password length (default: 12)', default: 12 },
      includeSymbols: { type: 'boolean', description: 'Include special symbols (default: true)', default: true },
      includeNumbers: { type: 'boolean', description: 'Include numbers (default: true)', default: true }
    }
  },
  execute: async (params: { length?: number; includeSymbols?: boolean; includeNumbers?: boolean }) => {
    try {
      const length = params.length || 12;
      const includeSymbols = params.includeSymbols !== false;
      const includeNumbers = params.includeNumbers !== false;
      
      let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (includeNumbers) chars += '0123456789';
      if (includeSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      let password = '';
      for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      return { password };
    } catch (error: any) {
      throw new Error(`Password generation failed: ${error.message}`);
    }
  }
});

const formatNumber = functionTool({
  name: 'format-number',
  description: 'Formats numbers with various options',
  inputSchema: {
    type: 'object',
    properties: {
      number: { type: 'number', description: 'Number to format' },
      type: { type: 'string', description: 'Format type: currency, percentage, comma, or decimal', default: 'comma' },
      currency: { type: 'string', description: 'Currency code for currency formatting (default: USD)', default: 'USD' },
      decimals: { type: 'number', description: 'Number of decimal places (default: 2)', default: 2 }
    },
    required: ['number']
  },
  execute: async (params: { number: number; type?: string; currency?: string; decimals?: number }) => {
    try {
      const type = params.type || 'comma';
      const currency = params.currency || 'USD';
      const decimals = params.decimals !== undefined ? params.decimals : 2;
      
      let formatted = '';
      
      switch (type) {
        case 'currency':
          formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(params.number);
          break;
        case 'percentage':
          formatted = `${(params.number * 100).toFixed(decimals)}%`;
          break;
        case 'decimal':
          formatted = params.number.toFixed(decimals);
          break;
        case 'comma':
        default:
          formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(params.number);
          break;
      }
      
      return { formatted };
    } catch (error: any) {
      throw new Error(`Number formatting failed: ${error.message}`);
    }
  }
});

const calculateBmi = functionTool({
  name: 'calculate-bmi',
  description: 'Calculates BMI from weight and height',
  inputSchema: {
    type: 'object',
    properties: {
      weight: { type: 'number', description: 'Weight in kilograms' },
      height: { type: 'number', description: 'Height in meters' }
    },
    required: ['weight', 'height']
  },
  execute: async (params: { weight: number; height: number }) => {
    try {
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

const calculateAge = functionTool({
  name: 'calculate-age',
  description: 'Calculates age from birth date',
  inputSchema: {
    type: 'object',
    properties: {
      birthDate: { type: 'string', description: 'Birth date in YYYY-MM-DD format' }
    },
    required: ['birthDate']
  },
  execute: async (params: { birthDate: string }) => {
    try {
      const birth = new Date(params.birthDate);
      const today = new Date();
      
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

const generateQuote = functionTool({
  name: 'generate-quote',
  description: 'Generates an inspirational quote',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    try {
      const quotes = [
        { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
        { text: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
        { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
        { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
        { text: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle' }
      ];
      
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      return quote;
    } catch (error: any) {
      throw new Error(`Quote generation failed: ${error.message}`);
    }
  }
});

const convertCurrency = functionTool({
  name: 'convert-currency',
  description: 'Converts currency amounts using exchange rates',
  inputSchema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to convert' },
      from: { type: 'string', description: 'Source currency code (e.g., USD)' },
      to: { type: 'string', description: 'Target currency code (e.g., EUR)' }
    },
    required: ['amount', 'from', 'to']
  },
  execute: async (params: { amount: number; from: string; to: string }) => {
    try {
      const rates: Record<string, number> = {
        USD: 1.0,
        EUR: 0.85,
        GBP: 0.73,
        JPY: 110.0,
        CAD: 1.25,
        AUD: 1.35
      };
      
      const fromRate = rates[params.from.toUpperCase()];
      const toRate = rates[params.to.toUpperCase()];
      
      if (!fromRate || !toRate) {
        throw new Error('Unsupported currency code');
      }
      
      const converted = (params.amount / fromRate) * toRate;
      
      return {
        amount: params.amount,
        from: params.from.toUpperCase(),
        to: params.to.toUpperCase(),
        converted: Math.round(converted * 100) / 100
      };
    } catch (error: any) {
      throw new Error(`Currency conversion failed: ${error.message}`);
    }
  }
});

export const dataWorkshopSubAgent = subAgent({
  id: 'data-workshop-sub-agent',
  name: 'data-workshop-agent',
  description: `A versatile data workshop agent that provides various utility functions including text analysis, calculations, data formatting, and more.`,
  prompt: `You are a helpful data workshop assistant with access to various utility tools. You can help users with:

- Text analysis and processing
- Mathematical calculations (BMI, age, etc.)
- Data formatting and conversion
- Password generation and security
- QR code generation
- Currency conversion
- Entertainment (jokes and quotes)

Always use the appropriate tools to provide accurate results and be helpful in explaining what each tool does.`,
  canUse: () => [
    forecastWeather,
    geocodeAddress,
    hashText,
    generateQr,
    analyzeText,
    fetchJoke,
    generatePassword,
    formatNumber,
    calculateBmi,
    calculateAge,
    generateQuote,
    convertCurrency
  ]
});

export const dataWorkshopAgent = agent({
  id: 'data-workshop-agent',
  name: 'Data Workshop Agent',
  description: `A versatile data workshop agent that provides various utility functions including text analysis, calculations, data formatting, and more.`,
  defaultSubAgent: dataWorkshopSubAgent,
  subAgents: () => [dataWorkshopSubAgent]
});