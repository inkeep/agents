/**
 * Example: Using the Project class with AgentAgent
 * This example demonstrates how to use the new Project object helper
 * alongside the existing AgentAgent pattern.
 */

import { agent, agentAgent, project } from '../src';

// Create a project with model inheritance and execution limits
const customerSupportProject = project({
  id: 'customer-support-project',
  name: 'Customer Support System',
  description: 'Multi-agent customer support system with shared configurations',

  // Project-level model settings that cascade to agents and agents
  models: {
    base: { model: 'gpt-4o-mini' },
    structuredOutput: { model: 'gpt-4o' },
    summarizer: { model: 'gpt-3.5-turbo' },
  },

  // Project-level execution limits
  stopWhen: {
    transferCountIs: 10, // Maximum agent transfers per conversation
    stepCountIs: 50, // Maximum steps per agent
  },

  // Project contains multiple agents
  agents: () => [
    // Tier 1 support agent
    agentAgent({
      id: 'tier1-support-agent',
      name: 'Tier 1 Support',
      description: 'Initial customer support handling',
      defaultSubAgent: agent({
        id: 'tier1-agent',
        name: 'Tier 1 Support Agent',
        prompt:
          'You are a Tier 1 customer support agent. Help customers with basic questions and escalate complex issues.',
      }),
      agents: () => [
        agent({
          id: 'tier1-agent',
          name: 'Tier 1 Support Agent',
          prompt:
            'You are a Tier 1 customer support agent. Help customers with basic questions and escalate complex issues.',
        }),
        agent({
          id: 'escalation-agent',
          name: 'Escalation Agent',
          prompt: 'You handle escalated issues from Tier 1 support.',
        }),
      ],
    }),

    // Specialized technical support agent
    agentAgent({
      id: 'technical-support-agent',
      name: 'Technical Support',
      description: 'Specialized technical issue resolution',
      // This agent inherits models from the project but can override stopWhen
      stopWhen: {
        transferCountIs: 15, // Override project default for technical issues
      },
      defaultSubAgent: agent({
        id: 'technical-agent',
        name: 'Technical Support Agent',
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
  const billingAgent = agentAgent({
    id: 'billing-support-agent',
    name: 'Billing Support',
    description: 'Specialized billing and payment support',
    defaultSubAgent: agent({
      id: 'billing-agent',
      name: 'Billing Support Agent',
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
