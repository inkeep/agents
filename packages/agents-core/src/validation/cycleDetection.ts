import type { FullAgentDefinition } from '../types/entities';

export type DelegationEdge = {
  source: string;
  target: string;
};

export function detectDelegationCycles(agentData: FullAgentDefinition): string[] {
  const graph = buildDelegationGraph(agentData);
  const cycles: string[] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of graph.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (stack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push(
          `Circular delegation detected: ${[...path.slice(cycleStart), neighbor].join(' → ')}`
        );
        return true;
      }
    }

    stack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      path.length = 0;
      dfs(node);
    }
  }

  return cycles;
}

function buildDelegationGraph(agentData: FullAgentDefinition): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const [subAgentId, subAgent] of Object.entries(agentData.subAgents)) {
    const delegates = subAgent.canDelegateTo?.filter((d): d is string => typeof d === 'string');
    if (delegates?.length) {
      graph.set(subAgentId, delegates);
    }
  }

  return graph;
}
