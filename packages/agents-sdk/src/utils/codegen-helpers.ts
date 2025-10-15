import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';

const require = createRequire(import.meta.url);

export const NAMING_CONVENTION_RULES = `
CRITICAL NAMING CONVENTION RULES (Apply to ALL imports/exports):
- File names ALWAYS use the exact original ID. IDs are made of file safe characters (e.g., '../tools/inkeep_facts', '../data-components/user-profile')
- Name of consts and variables, especially ones that are exported ones, MUST be camelCase versions of the ID, unless the ID is random/UUID then take it verbatim.
- Conversion rules for import/export names:
  - IDs with underscores: 'inkeep_facts' → inkeepFacts
  - IDs with hyphens: 'weather-api' → weatherApi
  - IDs with both: 'my_weather-api' → myWeatherApi
  - Random/UUID IDs: Keep as-is (e.g., 'fUI2riwrBVJ6MepT8rjx0' → fUI2riwrBVJ6MepT8rjx0)
  - IDs starting with uppercase: Make first letter lowercase unless it's an acronym or random or UUID
- The ID field in the exported object keeps the original format
- Examples:
  - Tool: import { inkeepFacts } from '../tools/inkeep_facts'; export const inkeepFacts = mcpTool({ id: 'inkeep_facts', ... })
  - Component: import { userProfile } from '../data-components/user-profile'; export const userProfile = dataComponent({ id: 'user-profile', ... })
  - Agent: import { myAgent } from './agent/my-agent'; export const myAgent = agent({ id: 'my-agent', ... })
`;

export const IMPORT_INSTRUCTIONS = `
CRITICAL: All imports MUST be alphabetically sorted (both named imports and path names)

CRITICAL IMPORT PATTERNS:
- Tools: Import from '../tools/{toolId}' (individual files)
- Data components: Import from '../data-components/{componentId}' (individual files)
- Artifact components: Import from '../artifact-components/{componentId}' (individual files)
- Agent: Import from './agent/{agentId}' (individual files)

NEVER use barrel imports from directories:
❌ WRONG: import { ordersList, refundApproval } from '../data-components';
✅ CORRECT:
   import { ordersList } from '../data-components/orders-list';
   import { refundApproval } from '../data-components/refund-approval';

EXAMPLES: 
// Multiple data components - each from individual file:
import { ordersList } from '../data-components/orders-list';
import { refundApproval } from '../data-components/refund-approval';

// Tools - each from individual file:
import { inkeepFacts } from '../tools/inkeep_facts';
import { weatherApi } from '../tools/weather-api';

// Agent - each from individual file:
import { inkeepQaAgent } from './agent/inkeep-qa-agent';
import { weatherAgent } from './agent/weather-agent';
`;

export const PROJECT_JSON_EXAMPLE = `
---START OF PROJECT JSON EXAMPLE---
{
  "id": "my-project",
  "name": "My Project",
  "description": "test test",
  "models": {
    "base": {
      "model": "${ANTHROPIC_MODELS.CLAUDE_OPUS_4_1_20250805}",
      "providerOptions": {
        "temperature": 0.7,
        "maxTokens": 2096
      }
    },
    "structuredOutput": {
      "model": "${OPENAI_MODELS.GPT_4_1_MINI_20250414}",
      "providerOptions": {
        "temperature": 0.4,
        "maxTokens": 2048
      }
    },
    "summarizer": {
      "model": "${OPENAI_MODELS.GPT_5_NANO_20250807}",
      "providerOptions": {
        "temperature": 0.8,
        "maxTokens": 1024
      }
    }
  },
  "stopWhen": {
    "transferCountIs": 10,
    "stepCountIs": 24
  },
  "agent": {
    "customer-service": {
      "id": "customer-service",
      "name": "customer-service",
      "description": "respond to customer service requests",
      "defaultSubAgentId": "router",
      "subAgents": {
        "refund-agent": {
          "id": "refund-agent",
          "name": "Refund Agent",
          "description": "This agent is responsible for refunding customer orders",
          "prompt": "Refund customer orders based on the following criteria:\n- Order is under $100\n- Order was placed in the last 30 days\n- Customer has no other refunds in the last 30 days",
          "models": {
            "base": {
              "model": "${GOOGLE_MODELS.GEMINI_2_5_FLASH}"
            }
          },
          "stopWhen": {
            "stepCountIs": 24
          },
          "canTransferTo": ["router"],
          "canDelegateTo": [],
          "dataComponents": [],
          "artifactComponents": [],
          "canUse": []
        },
        "router": {
          "id": "router",
          "name": "Router",
          "description": "Routing incoming requests",
          "prompt": "You route incoming requests to the correect agent",
          "models": null,
          "stopWhen": {
            "stepCountIs": 24
          },
          "canTransferTo": ["refund-agent"],
          "canDelegateTo": [],
          "dataComponents": [],
          "artifactComponents": [],
          "canUse": []
        }
      },
      "createdAt": "2025-10-05T16:40:22.655Z",
      "updatedAt": "2025-10-05T16:43:26.813Z",
      "models": {
        "base": {
          "model": "${ANTHROPIC_MODELS.CLAUDE_SONNET_4_20250514}",
          "providerOptions": {
            "temperature": 0.5
          }
        }
      },
      "statusUpdates": {
        "numEvents": 10,
        "timeInSeconds": 13
      },
      "stopWhen": {
        "transferCountIs": 5
      }
    }
  },
  "tools": {},
  "dataComponents": {
    "listorders": {
      "id": "listorders",
      "name": "ListOrders",
      "description": "Display a list of customer orders",
      "props": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "An object containing a list of orders.",
        "properties": {
          "orders": {
            "type": "array",
            "description": "A list of order objects.",
            "items": {
              "type": "object",
              "description": "An individual order with identifying and creation details.",
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Unique identifier for the order."
                },
                "name": {
                  "type": "string",
                  "description": "Human-readable name or label for the order."
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Timestamp when the order was created, in ISO 8601 format."
                }
              },
              "required": ["id", "name", "createdAt"]
            }
          }
        },
        "required": ["orders"]
      }
    }
  },
  "artifactComponents": {},
  "credentialReferences": {},
  "createdAt": "2025-10-05T16:25:10.238Z",
  "updatedAt": "2025-10-05T16:27:27.777Z"
}
---END OF PROJECT JSON EXAMPLE---
`;

export function cleanGeneratedCode(text: string): string {
  return text
    .replace(/^```(?:typescript|ts)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

export function getTypeDefinitions(): string {
  try {
    const sdkPackagePath = require.resolve('@inkeep/agents-sdk/package.json');
    const sdkPackageDir = join(sdkPackagePath, '..');
    const sdkDtsPath = join(sdkPackageDir, 'dist/index.d.ts');

    const dtsContent = readFileSync(sdkDtsPath, 'utf-8');

    return `
TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):

The following is the complete type definition file from '@inkeep/agents-sdk'.

---START OF TYPE DEFINITIONS---
${dtsContent}
---END OF TYPE DEFINITIONS---
`;
  } catch (error) {
    console.warn('Could not read type definitions:', error);
    return `
// Type definitions from @inkeep/agents-sdk could not be loaded.
`;
  }
}
