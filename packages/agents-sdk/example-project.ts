/**
 * Example: Using the Project class with Agent
 * This example demonstrates how to use the new Project object helper
 * alongside the existing AgentAgent pattern.
 */

import { agent, OPENAI_MODELS, project, subAgent } from './src';

// Create a project with model inheritance and execution limits
const customerSupportProject = project({
  id: 'customer-support-project',
  name: 'Customer Support System',
  description: 'Multi-agent customer support system with shared configurations',

  // Project-level model settings that cascade to agents and agents
  models: {
    base: { model: OPENAI_MODELS.GPT_4_1_20250414 },
    structuredOutput: { model: OPENAI_MODELS.GPT_4_1_MINI_20250414 },
    summarizer: { model: OPENAI_MODELS.GPT_4_1_NANO_20250414 },
  },

  // Project-level execution limits
  stopWhen: {
    transferCountIs: 10, // Maximum agent transfers per conversation
    stepCountIs: 50, // Maximum steps per agent
  },

  // Project contains multiple agents
  agents: () => [
    // Tier 1 support agent
    agent({
      id: 'tier1-support-agent',
      name: 'Tier 1 Support',
      description: 'Initial customer support handling',
      defaultSubAgent: subAgent({
        id: 'tier1-agent',
        name: 'Tier 1 Support Agent',
        description: 'Initial customer support handling',
        prompt:
          'You are a Tier 1 customer support agent. Help customers with basic questions and escalate complex issues.',
      }),
      subAgents: () => [
        subAgent({
          id: 'tier1-agent',
          name: 'Tier 1 Support Agent',
          description: 'Initial customer support handling',
          prompt:
            'You are a Tier 1 customer support agent. Help customers with basic questions and escalate complex issues.',
        }),
        subAgent({
          id: 'escalation-agent',
          name: 'Escalation Agent',
          description: 'Handles escalated support issues',
          prompt: 'You handle escalated issues from Tier 1 support.',
        }),
      ],
    }),

    // Specialized technical support agent
    agent({
      id: 'technical-support-agent',
      name: 'Technical Support',
      description: 'Specialized technical issue resolution',
      // This agent inherits models from the project but can override stopWhen
      stopWhen: {
        transferCountIs: 15, // Override project default for technical issues
      },
      defaultSubAgent: subAgent({
        id: 'technical-agent',
        name: 'Technical Support Agent',
        description: 'Technical support specialist',
        prompt: 'You are a technical support specialist. Provide detailed technical assistance.',
      }),
    }),
  ],
});

// Initialize the project (this will also initialize all agents)
async function initializeProject() {
  try {
    await customerSupportProject.init();
    console.log('✅ Customer Support Project initialized successfully!');

    // Project stats
    const stats = customerSupportProject.getStats();
    console.log('📊 Project Stats:', stats);

    // Access individual agents
    const tier1Agent = customerSupportProject.getAgent('tier1-support-agent');
    const techAgent = customerSupportProject.getAgent('technical-support-agent');

    console.log('🎯 Agents loaded:', {
      tier1Available: !!tier1Agent,
      techAvailable: !!techAgent,
    });
  } catch (error) {
    console.error('❌ Failed to initialize project:', error);
  }
}

// Example of adding a new agent to an existing project
function addNewAgent() {
  const billingAgent = agent({
    id: 'billing-support-agent',
    name: 'Billing Support',
    description: 'Specialized billing and payment support',
    defaultSubAgent: subAgent({
      id: 'billing-agent',
      name: 'Billing Support Agent',
      description: 'Handles billing and payment inquiries',
      prompt: 'You handle billing inquiries and payment issues.',
    }),
  });

  customerSupportProject.addAgent(billingAgent);
  console.log('✅ Added billing support agent to project');
}

// Example of project validation
function validateProject() {
  const validation = customerSupportProject.validate();

  if (validation.valid) {
    console.log('✅ Project configuration is valid');
  } else {
    console.log('❌ Project validation errors:');
    for (const error of validation.errors) {
      console.log(`  - ${error}`);
    }
  }
}

export { customerSupportProject, initializeProject, addNewAgent, validateProject };
