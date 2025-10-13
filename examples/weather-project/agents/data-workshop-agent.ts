import { agent, subAgent } from '@inkeep/agents-sdk';
import { analyzeText } from '../function-tools/analyze-text';
import { calculateAge } from '../function-tools/calculate-age';
import { calculateBmi } from '../function-tools/calculate-bmi';
import { convertCurrency } from '../function-tools/convert-currency';
import { fetchJoke } from '../function-tools/fetch-joke';
import { formatNumber } from '../function-tools/format-number';
import { generatePassword } from '../function-tools/generate-password';
import { generateQr } from '../function-tools/generate-qr';
import { generateQuote } from '../function-tools/generate-quote';
import { hashText } from '../function-tools/hash-text';

const dataWorkshopSubAgent = subAgent({
  id: 'data-workshop-sub-agent',
  name: 'data-workshop-agent',
  description: `A comprehensive data processing and utility agent with tools for calculations, data fetching, text analysis, and more`,
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
    analyzeText,
    calculateAge,
    calculateBmi,
    convertCurrency,
    fetchJoke,
    formatNumber,
    generatePassword,
    generateQr,
    generateQuote,
    hashText
  ]
});

export const dataWorkshopAgent = agent({
  id: 'data-workshop-agent',
  name: 'Data Workshop Agent',
  defaultSubAgent: dataWorkshopSubAgent,
  subAgents: () => [dataWorkshopSubAgent]
});