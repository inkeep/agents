#!/usr/bin/env tsx

/**
 * Golden Test Set Seed Script
 *
 * Originally auto-generated on: 2025-11-17T21:36:31.981Z
 * Updated to use data-access layer functions
 * Filtered to only include inkeep-facts-project data
 * Simplified evaluator schemas to 3-4 output fields each
 *
 * This script seeds the database with a golden test set of:
 * - 1 dataset
 * - 10 dataset items
 * - 4 evaluators
 *
 * Usage:
 *   pnpm tsx scripts/seed-golden-testset.ts <projectId>
 *   pnpm tsx scripts/seed-golden-testset.ts inkeep-facts-project
 *
 * Arguments:
 *   projectId - The project ID to seed the data for (defaults to 'inkeep-facts-project')
 *
 * Set DATABASE_URL env var or it will use default from docker-compose
 */

import {
  createDataset,
  createDatasetItems,
  createEvaluator,
} from '../packages/agents-core/src/data-access/eval.js';
import { createDatabaseClient } from '../packages/agents-core/src/index.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://appuser:password@localhost:5432/inkeep_agents';

// Parse command-line arguments
const args = process.argv.slice(2);
const projectId = args[0] || 'inkeep-facts-project';

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: pnpm tsx scripts/seed-golden-testset.ts [projectId]

Arguments:
  projectId    The project ID to seed the data for (default: inkeep-facts-project)

Environment Variables:
  DATABASE_URL Database connection string (default: postgresql://appuser:password@localhost:5432/inkeep_agents)

Examples:
  pnpm tsx scripts/seed-golden-testset.ts
  pnpm tsx scripts/seed-golden-testset.ts my-custom-project
  DATABASE_URL=postgresql://user:pass@host:5432/db pnpm tsx scripts/seed-golden-testset.ts my-project
  `);
  process.exit(0);
}

async function seedGoldenTestSet() {
  console.log('🌱 Seeding golden test set...');
  console.log(`   DATABASE_URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`   Project ID: ${projectId}`);

  const db = createDatabaseClient({ connectionString: DATABASE_URL });

  try {
    // Seed Datasets
    console.log('\n📊 Seeding datasets...');
    const datasets = [
      {
        tenantId: 'default',
        projectId: projectId,
        id: '0tasi8ottpspzyul3ef41',
        name: 'Golden Test Set',
        description: 'golden test set for inkeep facts agent',
        createdAt: '2025-11-17 15:05:40.769',
        updatedAt: '2025-11-17 15:05:40.769',
      },
    ];

    const createDatasetFn = createDataset(db);
    for (const datasetRecord of datasets) {
      try {
        await createDatasetFn({
          tenantId: datasetRecord.tenantId,
          projectId: datasetRecord.projectId,
          id: datasetRecord.id,
          name: datasetRecord.name,
          description: datasetRecord.description,
        });
        console.log(`   ✓ Dataset: ${datasetRecord.name} (${datasetRecord.id})`);
      } catch (error: any) {
        if (error.message?.includes('duplicate key') || error.code === '23505') {
          console.log(`   ⚠ Dataset already exists: ${datasetRecord.name} (${datasetRecord.id})`);
        } else {
          throw error;
        }
      }
    }

    // Seed Dataset Items
    console.log('\n📝 Seeding dataset items...');
    const datasetItems = [
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'mk5et71b9cvlct36uw3xl',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Do you have a mobile app?',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: null,
        createdAt: '2025-11-17 15:08:51.744',
        updatedAt: '2025-11-17 15:08:51.744',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'qu47gs4al3ra51zdgfxkt',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Voice support?',
            },
          ],
        },
        expectedOutput: [
          {
            role: 'agent',
            content:
              "Inkeep currently doesn't have voice support functionality based on my knowledge. However, Inkeep does offer several other ways to interact with content including:\n\nWeb-based chat widgets and search bars\nSlack and Discord bots\nAPI integrations\nSupport team tools\nWould you like me to explain any of these existing capabilities in more detail?\n\nYou can also check out more about Inkeep's current features at Meet with a founder or reach out to Contact Us for specific requirements.",
          },
        ],
        simulationAgent: null,
        createdAt: '2025-11-17 15:09:15.852',
        updatedAt: '2025-11-17 15:09:15.852',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'jjxuf4q3ua2if83kubk08',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Can I use inkeep on whatsapp?',
            },
          ],
        },
        expectedOutput: [
          {
            role: 'agent',
            content:
              "Based on my knowledge, Inkeep currently doesn't have direct WhatsApp integration. Inkeep offers integrations for:\n\nDocumentation sites (like Docusaurus, GitBook, Next.js)\nMarketing sites (like Webflow, WordPress)\nHelp centers (Zendesk)\nCommunity platforms (Discord, Slack, Discourse)\nWeb applications\nIf you're looking to add AI chat capabilities to a messaging platform, Inkeep currently supports Discord and Slack. You could also explore using Inkeep's Chat API to build a custom integration.\n\nWould you like me to provide more details about any of the existing integration options?",
          },
        ],
        simulationAgent: null,
        createdAt: '2025-11-17 15:10:40.988',
        updatedAt: '2025-11-17 15:10:40.988',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'v3bv756otruhr3hpbtvd8',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Does Inkeep support slack?',
            },
          ],
        },
        expectedOutput: [
          {
            role: 'agent',
            content:
              'Yes, Inkeep supports Slack in multiple ways:\n\nSlack Bot for Community Support Inkeep offers a 1-click install Slack bot that can answer questions in your community channels1. The bot supports several modes:\n\nAuto-Reply mode: Automatically responds to new threads in selected channels\nAI Draft mode: Provides draft responses your team can use as starting points\nLoop-In mode: Tag the bot when needed for context-aware suggestions\nCustom Branding You can customize the Slack bot with your own logo and name to match your brand.\n\n"Ask for help" Button When enabled, users can click an "Ask for help 👋" button in AI messages to tag your team for additional assistance.\n\nInternal Slack Channels Inkeep can also ingest threads from your internal support, solutions engineering, or sales channels as a knowledge source1.\n\nSupport Team Features For teams using Slack for customer support coordination (like #support-triage or #ask-an-expert channels), Inkeep provides tools to help draft responses and provide context.\n\nAdditionally, Inkeep offers direct support to customers via Slack channels1, making it a communication option for getting help from the Inkeep team itself.\n\nTo learn more, see the sources I considered:\n\n[1] Inkeep | Product\n\nSources\nInkeep | Product',
          },
        ],
        simulationAgent: null,
        createdAt: '2025-11-17 15:13:38.694',
        updatedAt: '2025-11-17 15:13:38.694',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: '2qm03tbncmipqxwzbyluz',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Does Inkeep integrate with Zendesk?',
            },
          ],
        },
        expectedOutput: [
          {
            role: 'agent',
            content:
              'Yes, Inkeep integrates with Zendesk in multiple ways:\n\n**1. Intelligent Forms that create Zendesk tickets**[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)[(3)](https://inkeep.com/intelligent-form)\nYou can use Inkeep\'s intelligent forms to deflect tickets before they\'re created, and when tickets do need to be submitted, they\'re sent directly to Zendesk[(3)](https://inkeep.com/intelligent-form). There are example implementations showing how to create tickets via Zendesk\'s API[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md).\n\n**2. Keep - Copilot for Support Teams**[(4)](https://inkeep.com/blog/copilot-for-support-teams)\nKeep works as a Zendesk sidebar app that helps support agents by:\n- Drafting replies based on your docs and previous tickets[(4)](https://inkeep.com/blog/copilot-for-support-teams)\n- Providing summaries and identifying next steps[(4)](https://inkeep.com/blog/copilot-for-support-teams)  \n- Converting closed tickets into publishable FAQs with one click[(4)](https://inkeep.com/blog/copilot-for-support-teams)\n\n**3. API Integration Examples**\nThe integration uses Zendesk\'s API with authentication via API tokens[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md). Here\'s how tickets are created programmatically:\n\n```typescript\nconst res = await fetch(`${process.env.ZENDESK_DOMAIN}/api/v2/tickets`, {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    Authorization: `Basic ${accessToken}`,\n  },\n  body: data,\n});\n```\n[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\nThe ticket creation includes features like:\n- Automatic inclusion of chat history from Inkeep conversations[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n- Pre-filling form fields with user information[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n- Linking back to the original Inkeep chat session for context[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\nYou can get started with Keep on Zendesk as a sidebar app[(4)](https://inkeep.com/blog/copilot-for-support-teams), or implement your own ticket creation flow using the [example repositories](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md).\n\nTo learn more, see the sources I considered:\n\n[[1] Inkeep to Zendesk Create Ticket Example](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)\n[[2] Intelligent Support Form](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)\n[[3] Inkeep | Intelligent Form Demo](https://inkeep.com/intelligent-form)\n[[4] Keep - A Copilot for Support Teams](https://inkeep.com/blog/copilot-for-support-teams)\n[[5] https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\n### Sources\n\n- [Inkeep to Zendesk Create Ticket Example](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)\n- [Intelligent Support Form](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)\n- [Inkeep | Intelligent Form Demo](https://inkeep.com/intelligent-form)\n- [Keep - A Copilot for Support Teams](https://inkeep.com/blog/copilot-for-support-teams)\n- [https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n',
          },
        ],
        simulationAgent: null,
        createdAt: '2025-11-17 15:16:44.774',
        updatedAt: '2025-11-17 15:16:44.774',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'zzxpyi4patpxjmxein3e5',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'do you train the models with the replies from past chats?',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: null,
        createdAt: '2025-11-17 15:17:19.877',
        updatedAt: '2025-11-17 15:17:19.877',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'c5p3jnkfw160phvcyzmia',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'what does inkeep do?',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: {
          model: {
            model: 'openai/gpt-4.1-nano',
          },
          prompt:
            'You are an agent that is simulating a user that is really confused about what inkeep does and has a lot of questions about its functionality and wants to know more about how the company works.',
          stopWhen: {
            stepCountIs: 3,
            transferCountIs: null,
          },
        },
        createdAt: '2025-11-17 15:22:22.829',
        updatedAt: '2025-11-17 15:22:22.829',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: '02ma6gcbnyo5zea1uujf6',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Does inkeep integrate with Jira?',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: null,
        createdAt: '2025-11-17 15:27:23.571',
        updatedAt: '2025-11-17 15:27:23.571',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: '7jgekzpot4q0ff0rg2jwg',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'Do you support Discord?',
            },
            {
              role: 'assistant',
              content:
                "\n\nYes, Inkeep supports Discord![(1)](https://inkeep.com/blog/slack-and-discord-copilots)[(2)](https://inkeep.com/product)\n\nThe Discord bot offers several key features:\n\n**Auto-Reply mode** - Works in both traditional channels and forum-styled threads, making it easy to add an `✨ask-ai` channel to your community[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\n**Ask for help button** - Users can click the `Ask for help 👋` button on any AI message to tag your team for additional assistance[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\n**Custom branding** - You can customize the bot's name to match your brand[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\nThe Discord bot is available as a 1-click install[(1)](https://inkeep.com/blog/slack-and-discord-copilots), and you can find integration documentation at [Discord](https://docs.inkeep.com/integrations/discord).\n\nTo learn more, see the sources I considered:\n\n[[1] Slack & Discord: Support Copilots](https://inkeep.com/blog/slack-and-discord-copilots)\n[[2] Inkeep | Product](https://inkeep.com/product)\n\n### Sources\n\n- [Slack & Discord: Support Copilots](https://inkeep.com/blog/slack-and-discord-copilots)\n- [Inkeep | Product](https://inkeep.com/product)\n",
            },
            {
              role: 'user',
              content: 'how do I integrate discord?',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: null,
        createdAt: '2025-11-17 15:28:41.212',
        updatedAt: '2025-11-17 16:41:33.247',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: '2rke8katm09otmt83pv8w',
        datasetId: '0tasi8ottpspzyul3ef41',
        input: {
          messages: [
            {
              role: 'user',
              content: 'how is billing calculated',
            },
          ],
        },
        expectedOutput: null,
        simulationAgent: {
          model: {
            model: 'openai/gpt-4.1-nano',
          },
          prompt:
            'You are a simulation agent that is simulating a user that wants to know how billing works. Ask questions related to how to find out how much would be charged and what are the payment options.',
          stopWhen: {
            stepCountIs: 3,
            transferCountIs: null,
          },
        },
        createdAt: '2025-11-17 15:32:39.53',
        updatedAt: '2025-11-17 15:32:39.53',
      },
    ];

    const createDatasetItemsFn = createDatasetItems(db);

    // Group items by dataset for batch creation
    const itemsByDataset = datasetItems.reduce(
      (acc, item) => {
        if (!acc[item.datasetId]) {
          acc[item.datasetId] = [];
        }
        acc[item.datasetId].push(item);
        return acc;
      },
      {} as Record<string, typeof datasetItems>
    );

    for (const [datasetId, items] of Object.entries(itemsByDataset)) {
      try {
        await createDatasetItemsFn(
          items.map((item) => ({
            tenantId: item.tenantId,
            projectId: item.projectId,
            id: item.id,
            datasetId: item.datasetId,
            input: item.input as any,
            expectedOutput: item.expectedOutput as any,
            simulationAgent: item.simulationAgent as any,
          }))
        );
        console.log(`   ✓ Dataset Items: ${items.length} items for dataset ${datasetId}`);
      } catch (error: any) {
        if (error.message?.includes('duplicate key') || error.code === '23505') {
          console.log(`   ⚠ Some dataset items already exist for dataset ${datasetId}`);
        } else {
          throw error;
        }
      }
    }

    // Seed Evaluators
    console.log('\n⚡ Seeding evaluators...');
    const evaluators = [
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'completeness-evaluator',
        name: 'Completeness Evaluator',
        description:
          "Evaluates whether the agent fully answers the user's question. Checks if all aspects of the question are addressed and if the response is comprehensive.",
        prompt:
          'You are evaluating an AI assistant\'s response for completeness. The assistant should fully answer the user\'s question without leaving important aspects unaddressed.\n\nKey criteria to evaluate:\n1. **Question Coverage**: Does the response address all parts of the user\'s question?\n2. **Comprehensiveness**: Is the response thorough and complete, or does it leave gaps?\n3. **Missing Information**: Are there aspects of the question that were not addressed?\n4. **Depth**: Does the response go deep enough, or is it too superficial?\n5. **Follow-up Needs**: Would the user need to ask follow-up questions to get complete information?\n\nThe agent\'s instructions emphasize:\n- "A concise, to the point response to the user\'s question. No fluff. No apologies. No extra information. Just the answer."\n- "Help developers use Inkeep, always citing sources"\n- "Extract and provide the actual steps, code examples, or information from guides rather than referring users to them"\n\nEvaluate the conversation and provide your assessment.',
        schema: {
          type: 'object',
          required: ['completenessScore', 'missingAspects', 'strengths', 'overallAssessment'],
          properties: {
            completenessScore: {
              type: 'number',
              description:
                'Overall completeness score (0-10). Higher scores indicate more complete answers.',
            },
            missingAspects: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of aspects of the question that were not addressed',
            },
            strengths: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Positive aspects of the completeness',
            },
            overallAssessment: {
              type: 'string',
              description: 'Overall assessment of completeness',
            },
          },
        },
        model: {
          model: 'openai/gpt-4.1-nano',
        },
        passCriteria: {
          operator: 'and',
          conditions: [
            {
              field: 'completenessScore',
              operator: '>=',
              value: 7,
            },
          ],
        },
        createdAt: '2025-11-17 15:43:08.883',
        updatedAt: '2025-11-17 15:51:43.4',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'clarity-evaluator',
        name: 'Clarity Evaluator',
        description:
          "Evaluates the clarity and understandability of the agent's responses. Checks if the language is clear, well-structured, and easy to follow.",
        prompt:
          'You are evaluating an AI assistant\'s response for clarity. The assistant should provide clear, understandable responses that are easy to follow.\n\nKey criteria to evaluate:\n1. **Language Clarity**: Is the language clear and easy to understand?\n2. **Structure**: Is the response well-organized and structured?\n3. **Conciseness**: Is the response concise without unnecessary fluff?\n4. **Technical Communication**: Are technical concepts explained clearly?\n5. **Readability**: Is the response easy to read and follow?\n\nThe agent\'s instructions emphasize:\n- "A concise, to the point response to the user\'s question. No fluff. No apologies. No extra information. Just the answer."\n- "Direct, neutral, no fluff" tone\n- "Must be removed from the response" for fluff\n- "Use the response_format to format your response"\n\nEvaluate the conversation and provide your assessment.',
        schema: {
          type: 'object',
          required: ['clarityScore', 'unclearSections', 'strengths', 'overallAssessment'],
          properties: {
            clarityScore: {
              type: 'number',
              description:
                'Overall clarity score (0-10). Higher scores indicate clearer responses.',
            },
            unclearSections: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of sections that are unclear or confusing',
            },
            strengths: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Positive aspects of the clarity',
            },
            overallAssessment: {
              type: 'string',
              description: 'Overall assessment of clarity',
            },
          },
        },
        model: {
          model: 'openai/gpt-4.1-nano',
        },
        passCriteria: {
          operator: 'and',
          conditions: [
            {
              field: 'clarityScore',
              operator: '>=',
              value: 7,
            },
          ],
        },
        createdAt: '2025-11-17 15:43:08.887',
        updatedAt: '2025-11-17 15:51:36.41',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'hallucination-evaluator',
        name: 'Hallucination Evaluator',
        description:
          'Evaluates the degree of hallucination in the conversation. Checks if the agent provides factual information from sources and avoids making up information.',
        prompt:
          'You are an evaluator that evaluates the degree of hallucination in the conversation. A agent can be considered to hallucinate if it does not align with established knowledge, verifiable data, or logical inference, and often includes elements that are implausible, misleading, or entirely fictional.\n\nThe assistant should only provide factual information from sources and never make up information.\n\nKey criteria to evaluate:\n1. **Hallucination Detection**: Are there any fabricated facts, names, code, or information?\n2. **unsupported_statement**: Claim not explicitly backed by a cited source\n\nEvaluate the conversation and provide your assessment.',
        schema: {
          type: 'object',
          required: ['hallucinationScore', 'hallucinations', 'overallAssessment'],
          properties: {
            hallucinationScore: {
              type: 'number',
              description:
                'Overall hallucination score (0-10). Higher scores indicate fewer hallucinations and more factual accuracy.',
            },
            hallucinations: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of specific hallucinations detected',
            },
            overallAssessment: {
              type: 'string',
              description: 'Overall assessment of hallucination level',
            },
          },
        },
        model: {
          model: 'openai/gpt-4.1-nano',
        },
        passCriteria: {
          operator: 'and',
          conditions: [
            {
              field: 'hallucinationScore',
              operator: '>=',
              value: 8,
            },
          ],
        },
        createdAt: '2025-11-17 15:43:08.892',
        updatedAt: '2025-11-17 15:51:49.164',
      },
      {
        tenantId: 'default',
        projectId: projectId,
        id: 'zq1w8av7tzliq35uyp88e',
        name: 'Expected Output Similarity Evaluator',
        description:
          "Evaluates how similar the agent's response is to the expected output from the dataset item. Returns N/A if no expected output is provided.\n",
        prompt:
          'You are evaluating an AI assistant\'s response by comparing it to the expected output from the dataset item.\n\nKey criteria to evaluate:\n1. **Expected Output Availability**: Is there an expected output provided for this dataset item?\n2. **Semantic Similarity**: If expected output exists, how semantically similar is the actual response to the expected output?\n3. **Key Information Match**: Do the key pieces of information in the expected output appear in the actual response?\n4. **Completeness Match**: Does the actual response cover the same topics/points as the expected output?\n5. **Tone and Style**: Are the tone and style similar between expected and actual outputs?\n\n**IMPORTANT**: \n- If NO expected output is provided or found, set "hasExpectedOutput" to false and do NOT provide "similarityScore" or "differences" fields.\n- Only provide "similarityScore" and "differences" fields when expected output is available.\n- Look for expected output in:\n  - The conversation history (may be mentioned as "expected output" or "expected response")\n  - The execution trace (may contain dataset item information)\n  - The agent definition (may reference expected outputs)\n\nEvaluate the conversation and provide your assessment.',
        schema: {
          type: 'object',
          required: ['hasExpectedOutput', 'overallAssessment'],
          properties: {
            hasExpectedOutput: {
              type: 'boolean',
              description:
                'Whether an expected output was found for this dataset item.',
            },
            similarityScore: {
              type: 'number',
              description:
                'Overall similarity score (0-10) if expected output exists. Higher scores indicate greater similarity. Only provided when hasExpectedOutput is true.',
            },
            differences: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                'List of key differences between expected and actual output. Only provided when hasExpectedOutput is true.',
            },
            overallAssessment: {
              type: 'string',
              description:
                'Overall assessment of similarity, or explanation of why evaluation is N/A',
            },
          },
        },
        model: {
          model: 'openai/gpt-4.1-nano',
        },
        passCriteria: {
          operator: 'or',
          conditions: [
            {
              field: 'hasExpectedOutput',
              operator: '=',
              value: 0,
            },
            {
              field: 'similarityScore',
              operator: '>=',
              value: 7,
            },
          ],
        },
        createdAt: '2025-11-17 15:49:29.889',
        updatedAt: '2025-11-17 16:12:14.188',
      },
    ];

    const createEvaluatorFn = createEvaluator(db);
    for (const evaluatorRecord of evaluators) {
      try {
        await createEvaluatorFn({
          tenantId: evaluatorRecord.tenantId,
          projectId: evaluatorRecord.projectId,
          id: evaluatorRecord.id,
          name: evaluatorRecord.name,
          description: evaluatorRecord.description,
          prompt: evaluatorRecord.prompt,
          schema: evaluatorRecord.schema as any,
          model: evaluatorRecord.model as any,
          passCriteria: evaluatorRecord.passCriteria as any,
        });
        console.log(`   ✓ Evaluator: ${evaluatorRecord.name} (${evaluatorRecord.id})`);
      } catch (error: any) {
        if (error.message?.includes('duplicate key') || error.code === '23505') {
          console.log(
            `   ⚠ Evaluator already exists: ${evaluatorRecord.name} (${evaluatorRecord.id})`
          );
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ Golden test set seeded successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Datasets: ${datasets.length}`);
    console.log(`   - Dataset Items: ${datasetItems.length}`);
    console.log(`   - Evaluators: ${evaluators.length}`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  }
}

seedGoldenTestSet().catch((error) => {
  console.error(error);
  process.exit(1);
});
