#!/usr/bin/env tsx
/**
 * Golden Test Set Seed Script
 * 
 * Auto-generated on: 2025-11-17T21:36:31.981Z
 * 
 * This script seeds the database with a golden test set of:
 * - 6 dataset(s)
 * - 20 dataset item(s)
 * - 7 evaluator(s)
 * 
 * Usage:
 *   tsx scripts/seed-golden-testset.ts
 * 
 * Set DATABASE_URL env var or it will use default from docker-compose
 */

import { createDatabaseClient, generateId } from '../packages/agents-core/src/index.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://appuser:password@localhost:5432/inkeep_agents';

async function seedGoldenTestSet() {
  console.log('🌱 Seeding golden test set...');
  console.log(`   DATABASE_URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  
  const db = createDatabaseClient({ connectionString: DATABASE_URL });

  try {
    // Seed Datasets
    console.log('\n📊 Seeding datasets...');
    const datasets = [
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "omvhsuaxujbl1e1eczazh",
        "name": "Golden Test Dataset",
        "description": "test cases for a weather agent",
        "createdAt": "2025-11-12 21:03:51.428",
        "updatedAt": "2025-11-12 21:03:51.428"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "c03mbjkmwdxxbpl15zfpq",
        "name": "test dataset",
        "description": "testing",
        "createdAt": "2025-11-13 15:08:46.342",
        "updatedAt": "2025-11-13 15:08:46.342"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "1x8q7f3rwrsgs5429fcb9",
        "name": "test with weather ",
        "description": "weather",
        "createdAt": "2025-11-13 17:02:05.33",
        "updatedAt": "2025-11-13 17:02:05.33"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "1y8xqekvjlq6q44zqqev7",
        "name": "weather testing eval/noeval",
        "description": "test",
        "createdAt": "2025-11-14 21:01:29.046",
        "updatedAt": "2025-11-14 21:01:29.046"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "0tasi8ottpspzyul3ef41",
        "name": "Golden Test Set",
        "description": "golden test set for inkeep facts agent",
        "createdAt": "2025-11-17 15:05:40.769",
        "updatedAt": "2025-11-17 15:05:40.769"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "d4t8k741lz3tlbc52w5ps",
        "name": "testing",
        "description": "testing",
        "createdAt": "2025-11-17 20:06:19.102",
        "updatedAt": "2025-11-17 20:06:19.102"
    }
];
    
    for (const dataset of datasets) {
      await db.execute(
        `INSERT INTO dataset (tenant_id, project_id, id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, project_id, id) DO UPDATE
         SET name = EXCLUDED.name, 
             description = EXCLUDED.description,
             updated_at = EXCLUDED.updated_at`,
        [
          dataset.tenantId,
          dataset.projectId,
          dataset.id,
          dataset.name,
          dataset.description,
          dataset.createdAt,
          dataset.updatedAt
        ]
      );
      console.log(`   ✓ Dataset: ${dataset.name} (${dataset.id})`);
    }

    // Seed Dataset Items
    console.log('\n📝 Seeding dataset items...');
    const datasetItems = [
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "n4dg4nfz34mydvgkajmsa",
        "datasetId": "omvhsuaxujbl1e1eczazh",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Hi!"
                },
                {
                    "role": "agent",
                    "content": "Hello!!!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-12 21:48:35.086",
        "updatedAt": "2025-11-12 22:18:22.385"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "me04pfgxzttuz1bgrypyy",
        "datasetId": "omvhsuaxujbl1e1eczazh",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hello!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": {
            "model": {
                "model": "openai/gpt-4.1-nano"
            },
            "prompt": "You are an assistant that is simulating an angry user who is demanding the weather for new york",
            "stopWhen": {
                "stepCountIs": null,
                "transferCountIs": null
            }
        },
        "createdAt": "2025-11-12 22:16:08.932",
        "updatedAt": "2025-11-13 14:44:16.973"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "sf10fg44dcl4yo7mzdvdg",
        "datasetId": "omvhsuaxujbl1e1eczazh",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi my name is shagun"
                },
                {
                    "role": "agent",
                    "content": "hi shagun!"
                },
                {
                    "role": "user",
                    "content": "what is the weather today!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-13 14:44:59.372",
        "updatedAt": "2025-11-13 14:44:59.372"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "qzwu1lpic7ybxmtoxxrxa",
        "datasetId": "c03mbjkmwdxxbpl15zfpq",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-13 15:08:55.532",
        "updatedAt": "2025-11-13 15:08:55.532"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "e50j97nlwxm10yn96bfo6",
        "datasetId": "c03mbjkmwdxxbpl15zfpq",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": {
            "model": {
                "model": "openai/gpt-4.1-nano"
            },
            "prompt": "you are a user who is wondering the weather in nyc",
            "stopWhen": {
                "stepCountIs": 3,
                "transferCountIs": null
            }
        },
        "createdAt": "2025-11-13 16:49:01.699",
        "updatedAt": "2025-11-13 16:49:01.699"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "6uoor8dgtvume4o589vz7",
        "datasetId": "c03mbjkmwdxxbpl15zfpq",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi weather in nyc!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-13 16:59:06.578",
        "updatedAt": "2025-11-13 16:59:06.578"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "tm80q55imxc5nzp7bg870",
        "datasetId": "1x8q7f3rwrsgs5429fcb9",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi weather in nyc\n"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-13 17:02:12.689",
        "updatedAt": "2025-11-13 17:02:12.689"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "18esx8l65mx7l1hx2lj5a",
        "datasetId": "1x8q7f3rwrsgs5429fcb9",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi!!"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": {
            "model": {
                "model": "openai/gpt-4.1-nano"
            },
            "prompt": "you are a angry user who wants to know the weather in nyc right away",
            "stopWhen": {
                "stepCountIs": 3,
                "transferCountIs": null
            }
        },
        "createdAt": "2025-11-13 18:53:01.684",
        "updatedAt": "2025-11-13 18:53:01.684"
    },
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "0h0livxnahopknqwyd14y",
        "datasetId": "1y8xqekvjlq6q44zqqev7",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-14 21:01:40.467",
        "updatedAt": "2025-11-14 21:01:40.467"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "mk5et71b9cvlct36uw3xl",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Do you have a mobile app?"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:08:51.744",
        "updatedAt": "2025-11-17 15:08:51.744"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "qu47gs4al3ra51zdgfxkt",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Voice support?"
                }
            ]
        },
        "expectedOutput": [
            {
                "role": "agent",
                "content": "Inkeep currently doesn't have voice support functionality based on my knowledge. However, Inkeep does offer several other ways to interact with content including:\n\nWeb-based chat widgets and search bars\nSlack and Discord bots\nAPI integrations\nSupport team tools\nWould you like me to explain any of these existing capabilities in more detail?\n\nYou can also check out more about Inkeep's current features at Meet with a founder or reach out to Contact Us for specific requirements."
            }
        ],
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:09:15.852",
        "updatedAt": "2025-11-17 15:09:15.852"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "jjxuf4q3ua2if83kubk08",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Can I use inkeep on whatsapp?"
                }
            ]
        },
        "expectedOutput": [
            {
                "role": "agent",
                "content": "Based on my knowledge, Inkeep currently doesn't have direct WhatsApp integration. Inkeep offers integrations for:\n\nDocumentation sites (like Docusaurus, GitBook, Next.js)\nMarketing sites (like Webflow, WordPress)\nHelp centers (Zendesk)\nCommunity platforms (Discord, Slack, Discourse)\nWeb applications\nIf you're looking to add AI chat capabilities to a messaging platform, Inkeep currently supports Discord and Slack. You could also explore using Inkeep's Chat API to build a custom integration.\n\nWould you like me to provide more details about any of the existing integration options?"
            }
        ],
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:10:40.988",
        "updatedAt": "2025-11-17 15:10:40.988"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "v3bv756otruhr3hpbtvd8",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Does Inkeep support slack?"
                }
            ]
        },
        "expectedOutput": [
            {
                "role": "agent",
                "content": "Yes, Inkeep supports Slack in multiple ways:\n\nSlack Bot for Community Support Inkeep offers a 1-click install Slack bot that can answer questions in your community channels1. The bot supports several modes:\n\nAuto-Reply mode: Automatically responds to new threads in selected channels\nAI Draft mode: Provides draft responses your team can use as starting points\nLoop-In mode: Tag the bot when needed for context-aware suggestions\nCustom Branding You can customize the Slack bot with your own logo and name to match your brand.\n\n\"Ask for help\" Button When enabled, users can click an \"Ask for help 👋\" button in AI messages to tag your team for additional assistance.\n\nInternal Slack Channels Inkeep can also ingest threads from your internal support, solutions engineering, or sales channels as a knowledge source1.\n\nSupport Team Features For teams using Slack for customer support coordination (like #support-triage or #ask-an-expert channels), Inkeep provides tools to help draft responses and provide context.\n\nAdditionally, Inkeep offers direct support to customers via Slack channels1, making it a communication option for getting help from the Inkeep team itself.\n\nTo learn more, see the sources I considered:\n\n[1] Inkeep | Product\n\nSources\nInkeep | Product"
            }
        ],
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:13:38.694",
        "updatedAt": "2025-11-17 15:13:38.694"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "2qm03tbncmipqxwzbyluz",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Does Inkeep integrate with Zendesk?"
                }
            ]
        },
        "expectedOutput": [
            {
                "role": "agent",
                "content": "Yes, Inkeep integrates with Zendesk in multiple ways:\n\n**1. Intelligent Forms that create Zendesk tickets**[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)[(3)](https://inkeep.com/intelligent-form)\nYou can use Inkeep's intelligent forms to deflect tickets before they're created, and when tickets do need to be submitted, they're sent directly to Zendesk[(3)](https://inkeep.com/intelligent-form). There are example implementations showing how to create tickets via Zendesk's API[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md).\n\n**2. Keep - Copilot for Support Teams**[(4)](https://inkeep.com/blog/copilot-for-support-teams)\nKeep works as a Zendesk sidebar app that helps support agents by:\n- Drafting replies based on your docs and previous tickets[(4)](https://inkeep.com/blog/copilot-for-support-teams)\n- Providing summaries and identifying next steps[(4)](https://inkeep.com/blog/copilot-for-support-teams)  \n- Converting closed tickets into publishable FAQs with one click[(4)](https://inkeep.com/blog/copilot-for-support-teams)\n\n**3. API Integration Examples**\nThe integration uses Zendesk's API with authentication via API tokens[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)[(2)](https://github.com/inkeep/intelligent-support-form/blob/main/README.md). Here's how tickets are created programmatically:\n\n```typescript\nconst res = await fetch(`${process.env.ZENDESK_DOMAIN}/api/v2/tickets`, {\n  method: \"POST\",\n  headers: {\n    \"Content-Type\": \"application/json\",\n    Authorization: `Basic ${accessToken}`,\n  },\n  body: data,\n});\n```\n[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\nThe ticket creation includes features like:\n- Automatic inclusion of chat history from Inkeep conversations[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n- Pre-filling form fields with user information[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n- Linking back to the original Inkeep chat session for context[(5)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\nYou can get started with Keep on Zendesk as a sidebar app[(4)](https://inkeep.com/blog/copilot-for-support-teams), or implement your own ticket creation flow using the [example repositories](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)[(1)](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md).\n\nTo learn more, see the sources I considered:\n\n[[1] Inkeep to Zendesk Create Ticket Example](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)\n[[2] Intelligent Support Form](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)\n[[3] Inkeep | Intelligent Form Demo](https://inkeep.com/intelligent-form)\n[[4] Keep - A Copilot for Support Teams](https://inkeep.com/blog/copilot-for-support-teams)\n[[5] https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n\n### Sources\n\n- [Inkeep to Zendesk Create Ticket Example](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main/README.md)\n- [Intelligent Support Form](https://github.com/inkeep/intelligent-support-form/blob/main/README.md)\n- [Inkeep | Intelligent Form Demo](https://inkeep.com/intelligent-form)\n- [Keep - A Copilot for Support Teams](https://inkeep.com/blog/copilot-for-support-teams)\n- [https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main](https://github.com/inkeep/inkeep-zendesk-ticket-creation-vercel/blob/main)\n"
            }
        ],
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:16:44.774",
        "updatedAt": "2025-11-17 15:16:44.774"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "zzxpyi4patpxjmxein3e5",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "do you train the models with the replies from past chats?"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:17:19.877",
        "updatedAt": "2025-11-17 15:17:19.877"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "c5p3jnkfw160phvcyzmia",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "what does inkeep do?"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": {
            "model": {
                "model": "openai/gpt-4.1-nano"
            },
            "prompt": "You are a simulation agent that is simulating a user that is really confused about what inkeep does and has a lot of questions about it functionality related to how the company works.",
            "stopWhen": {
                "stepCountIs": 3,
                "transferCountIs": null
            }
        },
        "createdAt": "2025-11-17 15:22:22.829",
        "updatedAt": "2025-11-17 15:22:22.829"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "02ma6gcbnyo5zea1uujf6",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Does inkeep integrate with Jira?"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:27:23.571",
        "updatedAt": "2025-11-17 15:27:23.571"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "7jgekzpot4q0ff0rg2jwg",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "Do you support Discord?"
                },
                {
                    "role": "assistant",
                    "content": "\n\nYes, Inkeep supports Discord![(1)](https://inkeep.com/blog/slack-and-discord-copilots)[(2)](https://inkeep.com/product)\n\nThe Discord bot offers several key features:\n\n**Auto-Reply mode** - Works in both traditional channels and forum-styled threads, making it easy to add an `✨ask-ai` channel to your community[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\n**Ask for help button** - Users can click the `Ask for help 👋` button on any AI message to tag your team for additional assistance[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\n**Custom branding** - You can customize the bot's name to match your brand[(1)](https://inkeep.com/blog/slack-and-discord-copilots)\n\nThe Discord bot is available as a 1-click install[(1)](https://inkeep.com/blog/slack-and-discord-copilots), and you can find integration documentation at [Discord](https://docs.inkeep.com/integrations/discord).\n\nTo learn more, see the sources I considered:\n\n[[1] Slack & Discord: Support Copilots](https://inkeep.com/blog/slack-and-discord-copilots)\n[[2] Inkeep | Product](https://inkeep.com/product)\n\n### Sources\n\n- [Slack & Discord: Support Copilots](https://inkeep.com/blog/slack-and-discord-copilots)\n- [Inkeep | Product](https://inkeep.com/product)\n"
                },
                {
                    "role": "user",
                    "content": "how do I integrate discord?"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-17 15:28:41.212",
        "updatedAt": "2025-11-17 16:41:33.247"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "2rke8katm09otmt83pv8w",
        "datasetId": "0tasi8ottpspzyul3ef41",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "how is billing calculated"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": {
            "model": {
                "model": "openai/gpt-4.1-nano"
            },
            "prompt": "You are a simulation agent that is simulating a user that wants to know how billing works. Ask questions related to how to find out how much would be charged and what are the payment options.",
            "stopWhen": {
                "stepCountIs": 3,
                "transferCountIs": null
            }
        },
        "createdAt": "2025-11-17 15:32:39.53",
        "updatedAt": "2025-11-17 15:32:39.53"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "h8alpu9m64iuawncvj23a",
        "datasetId": "d4t8k741lz3tlbc52w5ps",
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": "hi"
                }
            ]
        },
        "expectedOutput": null,
        "simulationAgent": null,
        "createdAt": "2025-11-17 20:06:24.21",
        "updatedAt": "2025-11-17 20:06:24.21"
    }
];
    
    for (const item of datasetItems) {
      await db.execute(
        `INSERT INTO dataset_item (tenant_id, project_id, id, dataset_id, input, expected_output, simulation_agent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, project_id, id) DO UPDATE
         SET input = EXCLUDED.input,
             expected_output = EXCLUDED.expected_output,
             simulation_agent = EXCLUDED.simulation_agent,
             updated_at = EXCLUDED.updated_at`,
        [
          item.tenantId,
          item.projectId,
          item.id,
          item.datasetId,
          JSON.stringify(item.input),
          item.expectedOutput ? JSON.stringify(item.expectedOutput) : null,
          item.simulationAgent ? JSON.stringify(item.simulationAgent) : null,
          item.createdAt,
          item.updatedAt
        ]
      );
      console.log(`   ✓ Dataset Item: ${item.id}`);
    }

    // Seed Evaluators
    console.log('\n⚡ Seeding evaluators...');
    const evaluators = [
    {
        "tenantId": "default",
        "projectId": "my-weather-project",
        "id": "8n2aptsapxkycq11kgu9e",
        "name": "quality check evaluator",
        "description": "quality checks",
        "prompt": "You are an evaluator. Evaluate the overall quality of this conversation. Rate the agent on:\n  \n1. Clarity - Were responses clear and easy to understand?\n2. Helpfulness - Did the agent effectively help the user?\n3. Professionalism - Was the tone appropriate and professional?\n4. Efficiency - Did the agent complete tasks efficiently without unnecessary steps?\nProvide specific examples for any issues identified.",
        "schema": {
            "type": "object",
            "required": [
                "clarity",
                "helpfulness",
                "professionalism",
                "efficiency",
                "issues"
            ],
            "properties": {
                "issues": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Any issues or problems in the conversation"
                },
                "clarity": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "How clear and understandable the responses were"
                },
                "efficiency": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "How efficiently the agent completed the task"
                },
                "helpfulness": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "How helpful the agent was in addressing user needs"
                },
                "professionalism": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "How professional and appropriate the tone was"
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-13 21:41:43.577",
        "updatedAt": "2025-11-13 21:41:43.577"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "citation-quality-evaluator",
        "name": "Citation Quality Evaluator",
        "description": "Evaluates whether the agent properly cites sources using artifact citations. Checks for proper citation format, completeness of citations, and whether all factual claims are backed by citations.",
        "prompt": "You are evaluating an AI assistant's response for citation quality. The assistant should cite sources using artifact references when providing factual information.\n\nKey criteria to evaluate:\n1. **Citation Presence**: Does the response cite sources for factual claims using artifact references?\n2. **Citation Completeness**: Are all factual claims backed by citations, or are there unsupported statements?\n3. **Citation Format**: Are citations properly formatted as artifact references (not just URLs or titles)?\n4. **Citation Relevance**: Are the cited sources actually relevant to the claims being made?\n5. **No Unsupported Claims**: Are there any factual claims made without citations?\n\nThe agent's instructions emphasize:\n- \"MUST save relevant information as artifacts using save_tool_result BEFORE citing them\"\n- \"Always cite using saved artifacts when referencing information sources\"\n- \"For every claim that comes **directly from** an information source, attach artifact citations in-line\"\n- \"Skip citations for statements that do **not** rely on an information source\"\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "citationScore",
                "citationPresence",
                "citationCompleteness",
                "citationFormat",
                "unsupportedClaims",
                "missingCitations",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of the citation quality"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where citation quality could be improved"
                },
                "citationScore": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Overall citation quality score (0-10). Higher scores indicate proper citation usage."
                },
                "citationFormat": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for citation format (0-10). Are citations properly formatted as artifact references?"
                },
                "citationPresence": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for presence of citations (0-10). Are citations present where needed?"
                },
                "missingCitations": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of statements that should have citations but do not"
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of citation quality"
                },
                "unsupportedClaims": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of factual claims made without proper citations"
                },
                "citationCompleteness": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for completeness of citations (0-10). Are all factual claims cited?"
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:43:08.873",
        "updatedAt": "2025-11-17 15:51:29.049"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "accuracy-evaluator",
        "name": "Accuracy Evaluator",
        "description": "Evaluates the accuracy of information provided by the agent. Checks if the information is correct, up-to-date, and aligned with the documentation sources.",
        "prompt": "You are evaluating an AI assistant's response for accuracy. The assistant should provide accurate, factual information based on documentation sources.\n\nKey criteria to evaluate:\n1. **Factual Correctness**: Is the information provided factually correct?\n2. **Source Alignment**: Does the information align with what's stated in the documentation sources?\n3. **Technical Accuracy**: Are technical details, code examples, and API usage correct?\n4. **No Misinformation**: Are there any incorrect statements or misleading information?\n5. **Precision**: Is the information precise and specific, or vague and general?\n\nThe agent's instructions emphasize:\n- \"You must always use information sources to answer the user's question, never make up information\"\n- \"Only use knowledge_space to provide context for the user's question, NEVER use it to answer the user's question\"\n- \"Quote exactly inside code blocks\" for programming entities\n- \"Must be an exact quote from facts\" for code snippets\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "accuracyScore",
                "factualCorrectness",
                "sourceAlignment",
                "technicalAccuracy",
                "inaccuracies",
                "correctInformation",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of the accuracy"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where accuracy could be improved"
                },
                "inaccuracies": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of inaccurate statements or information"
                },
                "accuracyScore": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Overall accuracy score (0-10). Higher scores indicate more accurate information."
                },
                "sourceAlignment": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for alignment with sources (0-10). Does information match the documentation?"
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of accuracy"
                },
                "technicalAccuracy": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for technical accuracy (0-10). Are technical details correct?"
                },
                "correctInformation": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of accurate statements that demonstrate correctness"
                },
                "factualCorrectness": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for factual correctness (0-10). Is the information factually correct?"
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:43:08.878",
        "updatedAt": "2025-11-17 15:50:57.377"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "completeness-evaluator",
        "name": "Completeness Evaluator",
        "description": "Evaluates whether the agent fully answers the user's question. Checks if all aspects of the question are addressed and if the response is comprehensive.",
        "prompt": "You are evaluating an AI assistant's response for completeness. The assistant should fully answer the user's question without leaving important aspects unaddressed.\n\nKey criteria to evaluate:\n1. **Question Coverage**: Does the response address all parts of the user's question?\n2. **Comprehensiveness**: Is the response thorough and complete, or does it leave gaps?\n3. **Missing Information**: Are there aspects of the question that were not addressed?\n4. **Depth**: Does the response go deep enough, or is it too superficial?\n5. **Follow-up Needs**: Would the user need to ask follow-up questions to get complete information?\n\nThe agent's instructions emphasize:\n- \"A concise, to the point response to the user's question. No fluff. No apologies. No extra information. Just the answer.\"\n- \"Help developers use Inkeep, always citing sources\"\n- \"Extract and provide the actual steps, code examples, or information from guides rather than referring users to them\"\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "completenessScore",
                "questionCoverage",
                "comprehensiveness",
                "depth",
                "missingAspects",
                "addressedAspects",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "depth": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for depth (0-10). Does the response go deep enough?"
                },
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of the completeness"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where completeness could be improved"
                },
                "missingAspects": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of aspects of the question that were not addressed"
                },
                "addressedAspects": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of aspects of the question that were properly addressed"
                },
                "questionCoverage": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for question coverage (0-10). Are all parts of the question addressed?"
                },
                "completenessScore": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Overall completeness score (0-10). Higher scores indicate more complete answers."
                },
                "comprehensiveness": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for comprehensiveness (0-10). Is the response thorough?"
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of completeness"
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:43:08.883",
        "updatedAt": "2025-11-17 15:51:43.4"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "clarity-evaluator",
        "name": "Clarity Evaluator",
        "description": "Evaluates the clarity and understandability of the agent's responses. Checks if the language is clear, well-structured, and easy to follow.",
        "prompt": "You are evaluating an AI assistant's response for clarity. The assistant should provide clear, understandable responses that are easy to follow.\n\nKey criteria to evaluate:\n1. **Language Clarity**: Is the language clear and easy to understand?\n2. **Structure**: Is the response well-organized and structured?\n3. **Conciseness**: Is the response concise without unnecessary fluff?\n4. **Technical Communication**: Are technical concepts explained clearly?\n5. **Readability**: Is the response easy to read and follow?\n\nThe agent's instructions emphasize:\n- \"A concise, to the point response to the user's question. No fluff. No apologies. No extra information. Just the answer.\"\n- \"Direct, neutral, no fluff\" tone\n- \"Must be removed from the response\" for fluff\n- \"Use the response_format to format your response\"\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "clarityScore",
                "languageClarity",
                "structure",
                "conciseness",
                "technicalCommunication",
                "unclearSections",
                "clearSections",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of the clarity"
                },
                "structure": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for structure (0-10). Is the response well-organized?"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where clarity could be improved"
                },
                "conciseness": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for conciseness (0-10). Is the response concise?"
                },
                "clarityScore": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Overall clarity score (0-10). Higher scores indicate clearer responses."
                },
                "clearSections": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of sections that are particularly clear"
                },
                "languageClarity": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for language clarity (0-10). Is the language clear?"
                },
                "unclearSections": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of sections that are unclear or confusing"
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of clarity"
                },
                "technicalCommunication": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Score for technical communication (0-10). Are technical concepts clear?"
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:43:08.887",
        "updatedAt": "2025-11-17 15:51:36.41"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "factual-correctness-evaluator",
        "name": "Factual Correctness Evaluator",
        "description": "Evaluates whether the agent avoids hallucinations and provides only factual information. Checks for made-up information, unsupported claims, and violations of factual correctness rules.",
        "prompt": "You are evaluating an AI assistant's response for factual correctness and absence of hallucinations. The assistant should only provide factual information from sources and never make up information.\n\nKey criteria to evaluate:\n1. **Hallucination Detection**: Are there any fabricated facts, names, code, or information?\n2. **Unsupported Claims**: Are there claims not backed by the documentation sources?\n3. **Invented Entities**: Are there code constructs, methods, or entities that don't exist?\n4. **Conflation**: Is information mixed across different technology variants incorrectly?\n5. **Violation Detection**: Are there violations of the agent's rules (unsupported statements, conflation, hallucination, invented entities)?\n\nThe agent's instructions explicitly prohibit:\n- **unsupported_statement**: \"Claim not explicitly backed by a cited source\"\n- **conflation**: \"Mixing information across technology variants\"\n- **hallucination**: \"Fabricated names, code, or facts\"\n- **invented_entity**: \"Never infer code or entities not in sources\"\n\nThe agent's rules state:\n- \"You must always use information sources to answer the user's question, never make up information\"\n- \"Never question, doubt, or verify information from these tools - it is authoritative\"\n- \"Mention only if present in facts\" for programming entities\n- \"Must be an exact quote from facts\" for code snippets\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "factualCorrectnessScore",
                "hallucinationCount",
                "unsupportedClaimsCount",
                "inventedEntitiesCount",
                "conflationCount",
                "hallucinations",
                "unsupportedClaims",
                "inventedEntities",
                "conflations",
                "factualStatements",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of factual correctness"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where factual correctness could be improved"
                },
                "conflations": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of conflation issues detected"
                },
                "hallucinations": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of specific hallucinations detected"
                },
                "conflationCount": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Number of conflation issues detected"
                },
                "inventedEntities": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of invented entities detected"
                },
                "factualStatements": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of statements that are factually correct and properly sourced"
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of factual correctness"
                },
                "unsupportedClaims": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of unsupported claims detected"
                },
                "hallucinationCount": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Number of hallucinations detected"
                },
                "inventedEntitiesCount": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Number of invented entities detected"
                },
                "unsupportedClaimsCount": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Number of unsupported claims detected"
                },
                "factualCorrectnessScore": {
                    "type": "number",
                    "maximum": 10,
                    "minimum": 0,
                    "description": "Overall factual correctness score (0-10). Higher scores indicate fewer hallucinations and more factual accuracy."
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:43:08.892",
        "updatedAt": "2025-11-17 15:51:49.164"
    },
    {
        "tenantId": "default",
        "projectId": "inkeep-facts-project",
        "id": "zq1w8av7tzliq35uyp88e",
        "name": "Expected Output Similarity Evaluator",
        "description": "Evaluates how similar the agent's response is to the expected output from the dataset item. Returns N/A if no expected output is provided.\n",
        "prompt": "You are evaluating an AI assistant's response by comparing it to the expected output from the dataset item.\n\nKey criteria to evaluate:\n1. **Expected Output Availability**: Is there an expected output provided for this dataset item?\n2. **Semantic Similarity**: If expected output exists, how semantically similar is the actual response to the expected output?\n3. **Key Information Match**: Do the key pieces of information in the expected output appear in the actual response?\n4. **Completeness Match**: Does the actual response cover the same topics/points as the expected output?\n5. **Tone and Style**: Are the tone and style similar between expected and actual outputs?\n\n**IMPORTANT**: \n- If NO expected output is provided or found in the conversation context, trace, or agent definition, you MUST set \"hasExpectedOutput\" to false and \"similarityScore\" to null (or \"N/A\" as a string).\n- Only compare similarity if expected output is available.\n- Look for expected output in:\n  - The conversation history (may be mentioned as \"expected output\" or \"expected response\")\n  - The execution trace (may contain dataset item information)\n  - The agent definition (may reference expected outputs)\n\nEvaluate the conversation and provide your assessment.",
        "schema": {
            "type": "object",
            "required": [
                "hasExpectedOutput",
                "similarityScore",
                "semanticSimilarity",
                "keyInformationMatch",
                "completenessMatch",
                "toneStyleMatch",
                "expectedOutputFound",
                "differences",
                "similarities",
                "strengths",
                "weaknesses",
                "overallAssessment"
            ],
            "properties": {
                "strengths": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Positive aspects of the match (or reasons why N/A if no expected output)"
                },
                "weaknesses": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Areas where the match could be improved (or empty if no expected output)"
                },
                "differences": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of key differences between expected and actual output (only if expected output exists). Empty array if no expected output."
                },
                "similarities": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of key similarities between expected and actual output (only if expected output exists). Empty array if no expected output."
                },
                "toneStyleMatch": {
                    "oneOf": [
                        {
                            "type": "number"
                        },
                        {
                            "enum": [
                                "N/A"
                            ],
                            "type": "string"
                        }
                    ],
                    "description": "Score for tone and style match (0-10) if expected output exists, or \"N/A\" if not available."
                },
                "similarityScore": {
                    "oneOf": [
                        {
                            "type": "number"
                        },
                        {
                            "enum": [
                                "N/A"
                            ],
                            "type": "string"
                        }
                    ],
                    "description": "Overall similarity score (0-10) if expected output exists, or \"N/A\" if no expected output is available. Higher scores indicate greater similarity."
                },
                "completenessMatch": {
                    "oneOf": [
                        {
                            "type": "number"
                        },
                        {
                            "enum": [
                                "N/A"
                            ],
                            "type": "string"
                        }
                    ],
                    "description": "Score for completeness match (0-10) if expected output exists, or \"N/A\" if not available. Measures if all topics are covered."
                },
                "hasExpectedOutput": {
                    "type": "boolean",
                    "description": "Whether an expected output was found for this dataset item. If false, similarity scores should be null/N/A."
                },
                "overallAssessment": {
                    "type": "string",
                    "description": "Overall assessment of similarity, or explanation of why evaluation is N/A"
                },
                "semanticSimilarity": {
                    "oneOf": [
                        {
                            "type": "number"
                        },
                        {
                            "enum": [
                                "N/A"
                            ],
                            "type": "string"
                        }
                    ],
                    "description": "Score for semantic similarity (0-10) if expected output exists, or \"N/A\" if not available. Measures how similar the meaning is."
                },
                "expectedOutputFound": {
                    "type": "string",
                    "description": "The expected output that was found, or \"Not found\" if no expected output was available."
                },
                "keyInformationMatch": {
                    "oneOf": [
                        {
                            "type": "number"
                        },
                        {
                            "enum": [
                                "N/A"
                            ],
                            "type": "string"
                        }
                    ],
                    "description": "Score for key information match (0-10) if expected output exists, or \"N/A\" if not available. Measures if key facts/info match."
                }
            }
        },
        "model": {
            "model": "openai/gpt-4.1-nano"
        },
        "createdAt": "2025-11-17 15:49:29.889",
        "updatedAt": "2025-11-17 16:12:14.188"
    }
];
    
    for (const evaluator of evaluators) {
      await db.execute(
        `INSERT INTO evaluator (tenant_id, project_id, id, name, description, prompt, schema, model, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, project_id, id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             prompt = EXCLUDED.prompt,
             schema = EXCLUDED.schema,
             model = EXCLUDED.model,
             updated_at = EXCLUDED.updated_at`,
        [
          evaluator.tenantId,
          evaluator.projectId,
          evaluator.id,
          evaluator.name,
          evaluator.description,
          evaluator.prompt,
          JSON.stringify(evaluator.schema),
          JSON.stringify(evaluator.model),
          evaluator.createdAt,
          evaluator.updatedAt
        ]
      );
      console.log(`   ✓ Evaluator: ${evaluator.name} (${evaluator.id})`);
    }

    console.log('\n✅ Golden test set seeded successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Datasets: ${datasets.length}`);
    console.log(`   - Dataset Items: ${datasetItems.length}`);
    console.log(`   - Evaluators: ${evaluators.length}`);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    await db.$client.end();
  }
}

seedGoldenTestSet().catch((error) => {
  console.error(error);
  process.exit(1);
});
