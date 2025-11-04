import { agent, subAgent } from '@inkeep/agents-sdk';

export const dataWorkshopAgent = agent({
  id: 'data-workshop-agent',
  name: `Data Workshop Agent`,
  description: `A versatile data workshop agent that provides various utility functions including text analysis, calculations, data formatting, and more.`,
  defaultSubAgent: subAgent({
    id: 'data-workshop-sub-agent',
    name: `data-workshop-agent`,
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
  }),
});
