import type { Edge } from '@xyflow/react';
import type { A2AEdgeData } from '@/components/agent/configuration/edge-types';

export type DelegationEdge = {
  source: string;
  target: string;
};

export function wouldCreateCycle(
  edges: Edge[],
  newDelegation: DelegationEdge
): boolean {
  const graph = buildDelegationGraph(edges);
  const sources = graph.get(newDelegation.source) || [];
  graph.set(newDelegation.source, [...sources, newDelegation.target]);
  return hasCycle(graph);
}

function buildDelegationGraph(edges: Edge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  
  for (const edge of edges) {
    const relationships = edge.data?.relationships as A2AEdgeData['relationships'] | undefined;
    if (!relationships) continue;
    
    if (relationships.delegateSourceToTarget) {
      const targets = graph.get(edge.source) || [];
      graph.set(edge.source, [...targets, edge.target]);
    }
    
    if (relationships.delegateTargetToSource) {
      const sources = graph.get(edge.target) || [];
      graph.set(edge.target, [...sources, edge.source]);
    }
  }
  
  return graph;
}

function hasCycle(graph: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();
  
  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    
    for (const neighbor of graph.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (stack.has(neighbor)) {
        return true;
      }
    }
    
    stack.delete(node);
    return false;
  }
  
  for (const node of graph.keys()) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  
  return false;
}

export function findNodesInCycles(edges: Edge[]): Set<string> {
  const graph = buildDelegationGraph(edges);
  const cycleNodes = new Set<string>();
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
        path.slice(cycleStart).forEach(n => cycleNodes.add(n));
        cycleNodes.add(neighbor);
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
  
  return cycleNodes;
}

export function getCycleErrorMessage(sourceAgent: string, targetAgent: string): string {
  return `Cannot create delegation from "${sourceAgent}" to "${targetAgent}" as it would create a circular delegation chain. Circular delegations can cause infinite loops.`;
}

