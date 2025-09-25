// Test graph configuration for CLI testing
// This is a mock implementation for testing the CLI

class MockAgent {
  constructor(config) {
    this.config = config;
  }

  getId() {
    return this.config.id;
  }
  getName() {
    return this.config.name;
  }
  getInstructions() {
    return this.config.instructions;
  }
  getTransfers() {
    return this.config.canTransferTo ? this.config.canTransferTo() : [];
  }
  getDelegates() {
    return this.config.canDelegateTo ? this.config.canDelegateTo() : [];
  }
  getTools() {
    return this.config.tools || {};
  }
  async init() {
    return this;
  }
}

class MockAgentGraph {
  constructor(config) {
    this.config = config;
    this.agents = new Map();
    this.defaultAgent = config.defaultAgent;

    // Add agents to map
    if (config.agents) {
      Object.entries(config.agents).forEach(([name, agent]) => {
        this.agents.set(name, agent);
      });
    }
  }

  async init() {
    console.log(`Initializing graph: ${this.config.id}`);
    // Mock initialization - would normally call backend API
    return this;
  }

  getId() {
    return this.config.id;
  }
  getName() {
    return this.config.name;
  }
  getDescription() {
    return this.config.description;
  }
  getDefaultAgent() {
    return this.defaultAgent;
  }
  getAgents() {
    return Array.from(this.agents.values());
  }
  getStats() {
    return {
      graphId: this.config.id,
      graphName: this.config.name,
      agentCount: this.agents.size,
      defaultAgent: this.defaultAgent?.getName(),
      tenantId: this.config.tenantId,
    };
  }
}

// Create mock agents
const routerAgent = new MockAgent({
  id: 'router',
  name: 'router',
  instructions: 'Route inquiries to appropriate agents',
  canTransferTo: () => [],
});

const qaAgent = new MockAgent({
  id: 'qa',
  name: 'qa',
  instructions: 'Answer questions',
  canTransferTo: () => [routerAgent],
});

// Export the graph
export const graph = new MockAgentGraph({
  id: 'test-graph',
  name: 'Test Graph',
  description: 'A test graph for CLI testing',
  tenantId: this.config.tenantId,
  defaultAgent: routerAgent,
  agents: {
    router: routerAgent,
    qa: qaAgent,
  },
});
