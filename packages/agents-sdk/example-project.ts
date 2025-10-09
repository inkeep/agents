/**
 * Example: Using the Project class with AgentGraph
 * This example demonstrates how to use the new Project object helper
 * alongside the existing AgentGraph pattern.
 */

import { agent, agentGraph, project } from '../src';

// Create a project with model inheritance and execution limits
const customerSupportProject = project({
  id: 'customer-support-project',
  name: 'Customer Support System',
  description: 'Multi-agent customer support system with shared configurations',

  // Project-level model settings that cascade to graphs and agents
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

  // Project contains multiple graphs
  graphs: () => [
    // Tier 1 support graph
    agentGraph({
      id: 'tier1-support-graph',
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

    // Specialized technical support graph
    agentGraph({
      id: 'technical-support-graph',
      name: 'Technical Support',
      description: 'Specialized technical issue resolution',
      // This graph inherits models from the project but can override stopWhen
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

// Initialize the project (this will also initialize all graphs)
async function initializeProject() {
  try {
    await customerSupportProject.init();
    console.log('✅ Customer Support Project initialized successfully!');

    // Project stats
    const stats = customerSupportProject.getStats();
    console.log('📊 Project Stats:', stats);

    // Access individual graphs
    const tier1Graph = customerSupportProject.getGraph('tier1-support-graph');
    const techGraph = customerSupportProject.getGraph('technical-support-graph');

    console.log('🎯 Graphs loaded:', {
      tier1Available: !!tier1Graph,
      techAvailable: !!techGraph,
    });
  } catch (error) {
    console.error('❌ Failed to initialize project:', error);
  }
}

// Example of adding a new graph to an existing project
function addNewGraph() {
  const billingGraph = agentGraph({
    id: 'billing-support-graph',
    name: 'Billing Support',
    description: 'Specialized billing and payment support',
    defaultSubAgent: agent({
      id: 'billing-agent',
      name: 'Billing Support Agent',
      prompt: 'You handle billing inquiries and payment issues.',
    }),
  });

  customerSupportProject.addGraph(billingGraph);
  console.log('✅ Added billing support graph to project');
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

export { customerSupportProject, initializeProject, addNewGraph, validateProject };
