#!/usr/bin/env node

/**
 * Manual CLI test script for introspect functionality
 *
 * Usage:
 *   npx tsx src/commands/pull-v3/__tests__/test-introspect-cli.ts
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { introspectGenerate } from '../introspect-generator';

// Create a comprehensive test project
const testProject: FullProjectDefinition = {
  id: 'customer-support-ai',
  name: 'Customer Support AI System',
  description:
    'Advanced AI-powered customer support system with multi-agent collaboration, external integrations, and comprehensive tooling for enterprise support operations.',

  models: {
    base: {
      model: 'gpt-4o-mini',
      providerOptions: {
        temperature: 0.7,
        maxTokens: 4096,
      },
    },
    structuredOutput: {
      model: 'gpt-4o',
      providerOptions: {
        temperature: 0.3,
      },
    },
    summarizer: {
      model: 'gpt-4o-mini',
      providerOptions: {
        temperature: 0.5,
      },
    },
  },

  stopWhen: {
    transferCountIs: 15,
    stepCountIs: 75,
  },

  credentialReferences: {
    'zendesk-api': {
      id: 'zendesk-api',
      name: 'Zendesk API Credentials',
      type: 'nango',
      credentialStoreId: 'main-vault',
      retrievalParams: { token: 'ZENDESK_API_TOKEN' },
    },
    'slack-bot': {
      id: 'slack-bot',
      name: 'Slack Bot Credentials',
      type: 'keychain',
      credentialStoreId: 'main-vault',
      retrievalParams: {
        clientId: 'SLACK_CLIENT_ID',
        clientSecret: 'SLACK_CLIENT_SECRET',
      },
    },
    'database-conn': {
      id: 'database-conn',
      name: 'Database Connection',
      type: 'memory',
      credentialStoreId: 'secure-vault',
      retrievalParams: {
        username: 'DB_USERNAME',
        password: 'DB_PASSWORD',
      },
    },
  },

  functions: {
    'sentiment-analyzer': {
      id: 'sentiment-analyzer',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Customer message text' },
          customerTier: { type: 'string', enum: ['basic', 'premium', 'enterprise'] },
        },
        required: ['message'],
      },
      dependencies: {
        natural: '^6.0.0',
        lodash: '^4.17.21',
      },
      executeCode: `async ({ message, customerTier = 'basic' }) => {
        // Sentiment analysis logic here
        const sentiment = Math.random() > 0.5 ? 'positive' : 'negative';
        const urgency = customerTier === 'enterprise' ? 'high' : 'medium';
        return { sentiment, urgency, confidence: 0.85 };
      }`,
    },
    'priority-calculator': {
      id: 'priority-calculator',
      inputSchema: {
        type: 'object',
        properties: {
          customerTier: { type: 'string' },
          issueType: { type: 'string' },
          sentiment: { type: 'string' },
          businessHours: { type: 'boolean' },
        },
        required: ['customerTier', 'issueType'],
      },
      executeCode: `async (params) => {
        // Priority calculation logic
        let priority = 'medium';
        if (params.customerTier === 'enterprise' && params.sentiment === 'negative') {
          priority = 'critical';
        }
        return { priority, escalate: priority === 'critical' };
      }`,
    },
  },

  tools: {
    'zendesk-integration': {
      id: 'zendesk-integration',
      name: 'Zendesk Integration',
      description: 'Complete Zendesk ticket management integration',
      config: {
        type: 'mcp',
        mcp: {
          server: {
            url: 'https://zendesk-mcp.example.com/v1',
          },
          transport: { type: 'streamable_http' },
          activeTools: ['create_ticket', 'update_ticket', 'search_tickets', 'get_customer'],
        },
      },
      credentialReferenceId: 'zendesk-api',
      headers: {
        'User-Agent': 'CustomerSupportAI/1.0',
      },
    },
    'knowledge-base': {
      id: 'knowledge-base',
      name: 'Knowledge Base Search',
      description: 'Search internal knowledge base and documentation',
      config: {
        type: 'mcp',
        mcp: {
          server: {
            url: 'https://kb-search.internal.com/mcp',
          },
          transport: { type: 'sse' },
          activeTools: ['search', 'get_article', 'suggest_articles'],
        },
      },
    },
    'slack-notifier': {
      id: 'slack-notifier',
      name: 'Slack Notifications',
      description: 'Send notifications and alerts to Slack channels',
      config: {
        type: 'mcp',
        mcp: {
          server: {
            url: 'https://slack-bot.example.com/mcp',
          },
          transport: { type: 'streamable_http' },
          activeTools: ['send_message', 'create_thread', 'update_status'],
        },
      },
      credentialReferenceId: 'slack-bot',
    },
  },

  dataComponents: {
    'customer-profile': {
      id: 'customer-profile',
      name: 'Customer Profile',
      description: 'Complete customer profile with history and preferences',
      props: {
        customerId: 'string',
        name: 'string',
        email: 'string',
        tier: 'string',
        accountManager: 'string',
        preferences: 'object',
        ticketHistory: 'array',
        satisfactionScore: 'number',
      },
    },
    'ticket-context': {
      id: 'ticket-context',
      name: 'Ticket Context',
      description: 'Comprehensive ticket information and context',
      props: {
        ticketId: 'string',
        subject: 'string',
        description: 'string',
        priority: 'string',
        status: 'string',
        assignedAgent: 'string',
        tags: 'array',
        attachments: 'array',
        conversationHistory: 'array',
      },
    },
    'resolution-data': {
      id: 'resolution-data',
      name: 'Resolution Data',
      description: 'Ticket resolution information and metrics',
      props: {
        resolutionTime: 'number',
        resolutionMethod: 'string',
        customerSatisfaction: 'number',
        escalationCount: 'number',
        followUpRequired: 'boolean',
      },
    },
  },

  artifactComponents: {
    'ticket-summary': {
      id: 'ticket-summary',
      name: 'Ticket Summary Report',
      description: 'Comprehensive ticket summary with resolution details',
      props: {
        type: 'object',
        properties: {
          ticketId: { type: 'string', inPreview: true },
          subject: { type: 'string', inPreview: true },
          priority: { type: 'string', inPreview: true },
          status: { type: 'string', inPreview: true },
          customer: { type: 'string', inPreview: true },
          resolutionSummary: { type: 'string' },
          actionsTaken: { type: 'array' },
          followUpItems: { type: 'array' },
          satisfactionScore: { type: 'number' },
        },
      },
    },
    'escalation-report': {
      id: 'escalation-report',
      name: 'Escalation Report',
      description: 'Detailed escalation report with context and recommendations',
      props: {
        type: 'object',
        properties: {
          escalationReason: { type: 'string', inPreview: true },
          currentAgent: { type: 'string', inPreview: true },
          suggestedAgent: { type: 'string', inPreview: true },
          urgencyLevel: { type: 'string', inPreview: true },
          customerContext: { type: 'object' },
          previousAttempts: { type: 'array' },
          recommendedActions: { type: 'array' },
        },
      },
    },
  },

  externalAgents: {
    'legacy-crm': {
      id: 'legacy-crm',
      name: 'Legacy CRM System',
      description: 'Integration with existing legacy CRM system',
      baseUrl: 'https://crm-legacy.company.com/agents/support',
      credentialReferenceId: 'database-conn',
    },
    'billing-system': {
      id: 'billing-system',
      name: 'Billing System Agent',
      description: 'Specialized agent for billing and payment inquiries',
      baseUrl: 'https://billing.company.com/ai-agent',
      credentialReferenceId: 'database-conn',
    },
  },

  agents: {
    'primary-support': {
      id: 'primary-support',
      name: 'Primary Support Agent',
      description:
        'Main customer support agent with comprehensive capabilities and intelligent routing',
      defaultSubAgentId: 'intake-specialist',

      subAgents: {
        'intake-specialist': {
          id: 'intake-specialist',
          name: 'Customer Intake Specialist',
          type: 'internal',
          description: 'Initial customer interaction and request classification',
          prompt: `You are a friendly and professional Customer Intake Specialist. Your role is to:
1. Greet customers warmly and gather initial information
2. Classify the type of inquiry (technical, billing, general support)
3. Assess urgency and customer sentiment
4. Route to appropriate specialist or handle simple requests directly

Always maintain a helpful and empathetic tone.`,
          canUse: [{ toolId: 'sentiment-analyzer' }, { toolId: 'knowledge-base' }],
          dataComponents: ['customer-profile'],
          artifactComponents: ['ticket-summary'],
        },

        'technical-specialist': {
          id: 'technical-specialist',
          name: 'Technical Support Specialist',
          type: 'internal',
          description: 'Advanced technical issue resolution and troubleshooting',
          prompt: `You are an expert Technical Support Specialist with deep product knowledge. Your responsibilities:
1. Diagnose complex technical issues
2. Provide step-by-step troubleshooting guidance
3. Escalate to engineering if needed
4. Document solutions for the knowledge base

Use technical language appropriate to the customer's expertise level.`,
          canUse: [
            { toolId: 'zendesk-integration' },
            { toolId: 'knowledge-base' },
            { toolId: 'priority-calculator' },
          ],
          canDelegateTo: ['escalation-specialist'],
          dataComponents: ['ticket-context', 'resolution-data'],
          artifactComponents: ['ticket-summary'],
          stopWhen: {
            stepCountIs: 30,
          },
        },

        'billing-specialist': {
          id: 'billing-specialist',
          name: 'Billing Support Specialist',
          type: 'internal',
          description: 'Specialized billing and account management support',
          prompt: `You are a Billing Support Specialist focused on account and payment issues. Handle:
1. Billing inquiries and disputes
2. Payment processing issues  
3. Account upgrades/downgrades
4. Refund requests within policy

Always verify customer identity before discussing account details.`,
          canUse: [{ toolId: 'zendesk-integration' }, { toolId: 'priority-calculator' }],
          canDelegateTo: [{ externalAgentId: 'billing-system' }],
          dataComponents: ['customer-profile', 'ticket-context'],
        },

        'escalation-specialist': {
          id: 'escalation-specialist',
          name: 'Escalation Specialist',
          type: 'internal',
          description: 'Handle escalated issues and complex customer situations',
          prompt: `You are an experienced Escalation Specialist for high-priority and complex issues. Your expertise includes:
1. De-escalating frustrated customers
2. Coordinating with multiple teams
3. Providing executive-level communication
4. Ensuring proper follow-up and resolution

Prioritize customer satisfaction and swift resolution.`,
          canUse: [
            { toolId: 'zendesk-integration' },
            { toolId: 'slack-notifier' },
            { toolId: 'priority-calculator' },
          ],
          canTransferTo: ['legacy-crm'],
          dataComponents: ['customer-profile', 'ticket-context', 'resolution-data'],
          artifactComponents: ['escalation-report'],
          stopWhen: {
            stepCountIs: 20,
          },
        },
      },

      contextConfig: {
        id: 'primary-support-context',
        headersSchema: {
          type: 'object',
          properties: {
            'customer-id': { type: 'string', description: 'Unique customer identifier' },
            'session-id': { type: 'string', description: 'Support session identifier' },
            channel: { type: 'string', description: 'Communication channel (email, chat, phone)' },
            'user-agent': { type: 'string', description: 'User agent string for web sessions' },
          },
          required: ['customer-id', 'session-id'],
        },
        contextVariables: {
          customerData: {
            fetchConfig: {
              url: 'https://api.company.com/customers/${headers.toTemplate("customer-id")}',
              method: 'GET',
              headers: {
                Authorization: 'Bearer ${credentials.apiToken}',
              },
            },
            responseSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                tier: { type: 'string' },
                accountManager: { type: 'string' },
              },
            },
            credentialReferenceId: 'zendesk-api',
          },
          ticketHistory: {
            fetchConfig: {
              url: 'https://api.company.com/tickets/customer/${headers.toTemplate("customer-id")}?limit=10',
              method: 'GET',
            },
            responseSchema: {
              type: 'object',
              properties: {
                tickets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      subject: { type: 'string' },
                      status: { type: 'string' },
                      createdAt: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },

      statusUpdates: {
        numEvents: 5,
        timeInSeconds: 20,
        statusComponents: [
          { type: 'tool-summary' },
          { type: 'progress-tracker' },
          { type: 'customer-satisfaction' },
        ],
        prompt:
          'Provide regular updates on ticket progress, tool usage, and customer interaction quality. Include next steps and any blockers.',
      },

      stopWhen: {
        transferCountIs: 8,
      },
    },
  },

  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log(chalk.blue('\n🧪 Testing Introspect Generator CLI\n'));

  // Create temporary test directory
  const testDir = join(tmpdir(), `introspect-cli-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  const projectPaths = {
    projectRoot: testDir,
    agentsDir: join(testDir, 'agent'),
    toolsDir: join(testDir, 'tool'),
    dataComponentsDir: join(testDir, 'data-components'),
    artifactComponentsDir: join(testDir, 'artifact-components'),
    statusComponentsDir: join(testDir, 'status-components'),
    environmentsDir: join(testDir, 'environment'),
    credentialsDir: join(testDir, 'credential'),
    contextConfigsDir: join(testDir, 'context-configs'),
    externalAgentsDir: join(testDir, 'external-agents'),
  };

  try {
    console.log(chalk.gray(`📁 Test directory: ${testDir}\n`));

    // Test the introspect generator
    await introspectGenerate(testProject, projectPaths, 'development', true);

    console.log(chalk.green("\n✅ Generation completed! Let's examine the output...\n"));

    // Display generated files
    const filesToCheck = [
      { path: 'index.ts', description: 'Main project file' },
      { path: 'environments/development.ts', description: 'Environment settings' },
      { path: 'credentials/zendesk-api.ts', description: 'Zendesk credentials' },
      { path: 'credentials/slack-bot.ts', description: 'Slack Bot credentials' },
      { path: 'credentials/database-conn.ts', description: 'Database Connection credentials' },
      { path: 'tools/zendesk-integration.ts', description: 'Zendesk MCP tool' },
      { path: 'tools/functions/sentiment-analyzer.ts', description: 'Sentiment analysis function' },
      { path: 'data-components/customer-profile.ts', description: 'Customer profile data' },
      { path: 'artifact-components/ticket-summary.ts', description: 'Ticket summary artifact' },
      { path: 'external-agents/legacy-crm.ts', description: 'Legacy CRM external agent' },
      { path: 'context-configs/primary-supportContext.ts', description: 'Primary support context' },
      {
        path: 'agents/sub-agents/intake-specialist.ts',
        description: 'Intake specialist sub-agent',
      },
      { path: 'agents/primary-support.ts', description: 'Primary support agent' },
    ];

    for (const file of filesToCheck) {
      const fullPath = join(testDir, file.path);
      if (existsSync(fullPath)) {
        console.log(chalk.green(`✅ ${file.description}`));
        console.log(chalk.gray(`   📄 ${file.path}`));

        // Show first few lines of content
        const content = readFileSync(fullPath, 'utf-8');
        const firstLines = content.split('\n').slice(0, 3).join('\n');
        console.log(
          chalk.gray(`   📝 ${firstLines.substring(0, 80)}${content.length > 80 ? '...' : ''}\n`)
        );
      } else {
        console.log(chalk.red(`❌ Missing: ${file.description}`));
        console.log(chalk.gray(`   📄 Expected: ${file.path}\n`));
      }
    }

    // Test project file specifically
    const projectFile = join(testDir, 'index.ts');
    if (existsSync(projectFile)) {
      const content = readFileSync(projectFile, 'utf-8');
      console.log(chalk.blue('🏗️  Main Project File Analysis:'));
      console.log(chalk.gray(`   Import count: ${(content.match(/import/g) || []).length}`));
      console.log(chalk.gray(`   Export count: ${(content.match(/export/g) || []).length}`));
      console.log(chalk.gray(`   File size: ${content.length} characters`));
      console.log(chalk.gray(`   Lines: ${content.split('\n').length}`));

      // Check for key elements
      const checks = [
        { pattern: /import.*project.*from.*@inkeep\/agents-sdk/, desc: 'SDK import' },
        { pattern: /export const customerSupportAi = project\({/, desc: 'Project export' },
        { pattern: /models:\s*{/, desc: 'Models configuration' },
        { pattern: /stopWhen:\s*{/, desc: 'Stop conditions' },
        { pattern: /agents:\s*\(\) => \[/, desc: 'Agents array' },
      ];

      console.log(chalk.blue('   Content validation:'));
      for (const check of checks) {
        const found = check.pattern.test(content);
        console.log(chalk.gray(`     ${found ? '✅' : '❌'} ${check.desc}`));
      }
    }

    console.log(chalk.green('\n🎉 CLI Test completed successfully!'));
    console.log(chalk.gray(`💡 You can examine all generated files in: ${testDir}`));
    console.log(chalk.yellow('\n⚠️  Note: Test directory will persist for manual inspection.'));
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'));
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testProject, main as testIntrospectCLI };
