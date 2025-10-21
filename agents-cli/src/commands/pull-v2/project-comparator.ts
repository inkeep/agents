/**
 * Project-specific comparison logic built on top of the existing json-comparator
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import { compareJsonObjects, type ComparisonResult } from '../../utils/json-comparator';

export interface ProjectDiff {
  hasChanges: boolean;
  
  // High-level changes
  projectInfo: boolean; // name, description, models changed
  
  // Component changes (arrays of component IDs)
  agents: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  tools: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  functions: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  dataComponents: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  artifactComponents: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  credentials: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  // Sub-agents are nested within agents
  subAgents: {
    added: Array<{ agentId: string; subAgentId: string }>;
    modified: Array<{ agentId: string; subAgentId: string }>;
    deleted: Array<{ agentId: string; subAgentId: string }>;
  };
  
  // Summary info
  summary: {
    totalChanges: number;
    affectedComponentTypes: string[];
  };
}

/**
 * Compare two project definitions and return a structured diff
 */
export function compareProjects(
  existing: FullProjectDefinition | null, 
  pulled: FullProjectDefinition
): ProjectDiff {
  const diff: ProjectDiff = {
    hasChanges: true,
    projectInfo: false,
    agents: { added: [], modified: [], deleted: [] },
    tools: { added: [], modified: [], deleted: [] },
    functions: { added: [], modified: [], deleted: [] },
    dataComponents: { added: [], modified: [], deleted: [] },
    artifactComponents: { added: [], modified: [], deleted: [] },
    credentials: { added: [], modified: [], deleted: [] },
    subAgents: { added: [], modified: [], deleted: [] },
    summary: { totalChanges: 0, affectedComponentTypes: [] }
  };
  
  // If no existing project, everything is new
  if (!existing) {
    diff.projectInfo = true;
    diff.agents.added = Object.keys(pulled.agents || {});
    diff.tools.added = Object.keys(pulled.tools || {});
    diff.functions.added = Object.keys(pulled.functions || {});
    diff.dataComponents.added = Object.keys(pulled.dataComponents || {});
    diff.artifactComponents.added = Object.keys(pulled.artifactComponents || {});
    diff.credentials.added = Object.keys(pulled.credentialReferences || {});
    
    // Add all sub-agents
    for (const [agentId, agent] of Object.entries(pulled.agents || {})) {
      for (const subAgentId of Object.keys(agent.subAgents || {})) {
        diff.subAgents.added.push({ agentId, subAgentId });
      }
    }
    
    diff.summary.totalChanges = calculateTotalChanges(diff);
    diff.summary.affectedComponentTypes = getAffectedTypes(diff);
    return diff;
  }
  
  // Compare project-level info
  const projectInfoComparison = compareJsonObjects(
    {
      name: existing.name,
      description: existing.description,
      models: existing.models
    },
    {
      name: pulled.name,
      description: pulled.description,
      models: pulled.models
    },
    { ignorePaths: ['updatedAt', 'createdAt'] }
  );
  diff.projectInfo = !projectInfoComparison.isEqual;
  
  // Compare each component type
  diff.agents = compareRecords(existing.agents || {}, pulled.agents || {});
  diff.tools = compareRecords(existing.tools || {}, pulled.tools || {});
  diff.functions = compareRecords(existing.functions || {}, pulled.functions || {});
  diff.dataComponents = compareRecords(existing.dataComponents || {}, pulled.dataComponents || {});
  diff.artifactComponents = compareRecords(existing.artifactComponents || {}, pulled.artifactComponents || {});
  diff.credentials = compareRecords(existing.credentialReferences || {}, pulled.credentialReferences || {});
  
  // Compare sub-agents (nested within agents)
  diff.subAgents = compareSubAgents(existing.agents || {}, pulled.agents || {});
  
  // Calculate summary
  diff.summary.totalChanges = calculateTotalChanges(diff);
  diff.summary.affectedComponentTypes = getAffectedTypes(diff);
  diff.hasChanges = diff.summary.totalChanges > 0 || diff.projectInfo;
  
  return diff;
}

/**
 * Compare two records (objects with string keys) and return added/modified/deleted
 */
function compareRecords<T>(existing: Record<string, T>, pulled: Record<string, T>) {
  const existingIds = new Set(Object.keys(existing));
  const pulledIds = new Set(Object.keys(pulled));
  
  const added = Array.from(pulledIds).filter(id => !existingIds.has(id));
  const deleted = Array.from(existingIds).filter(id => !pulledIds.has(id));
  
  const modified: string[] = [];
  for (const id of existingIds) {
    if (pulledIds.has(id)) {
      // Compare the actual objects, ignoring timestamps
      const comparison = compareJsonObjects(
        existing[id], 
        pulled[id], 
        { ignorePaths: ['updatedAt', 'createdAt'] }
      );
      if (!comparison.isEqual) {
        modified.push(id);
      }
    }
  }
  
  return { added, modified, deleted };
}

/**
 * Compare sub-agents nested within agents
 */
function compareSubAgents(
  existingAgents: Record<string, any>, 
  pulledAgents: Record<string, any>
) {
  const added: Array<{ agentId: string; subAgentId: string }> = [];
  const modified: Array<{ agentId: string; subAgentId: string }> = [];
  const deleted: Array<{ agentId: string; subAgentId: string }> = [];
  
  // First, collect all existing sub-agents
  const existingSubAgents = new Map<string, { agentId: string; subAgent: any }>();
  for (const [agentId, agent] of Object.entries(existingAgents)) {
    for (const [subAgentId, subAgent] of Object.entries(agent.subAgents || {})) {
      existingSubAgents.set(subAgentId, { agentId, subAgent });
    }
  }
  
  // Then collect all pulled sub-agents
  const pulledSubAgents = new Map<string, { agentId: string; subAgent: any }>();
  for (const [agentId, agent] of Object.entries(pulledAgents)) {
    for (const [subAgentId, subAgent] of Object.entries(agent.subAgents || {})) {
      pulledSubAgents.set(subAgentId, { agentId, subAgent });
    }
  }
  
  // Find added sub-agents
  for (const [subAgentId, { agentId }] of pulledSubAgents) {
    if (!existingSubAgents.has(subAgentId)) {
      added.push({ agentId, subAgentId });
    }
  }
  
  // Find deleted sub-agents
  for (const [subAgentId, { agentId }] of existingSubAgents) {
    if (!pulledSubAgents.has(subAgentId)) {
      deleted.push({ agentId, subAgentId });
    }
  }
  
  // Find modified sub-agents
  for (const [subAgentId, existingInfo] of existingSubAgents) {
    const pulledInfo = pulledSubAgents.get(subAgentId);
    if (pulledInfo) {
      const comparison = compareJsonObjects(
        existingInfo.subAgent,
        pulledInfo.subAgent,
        { ignorePaths: ['updatedAt', 'createdAt'] }
      );
      if (!comparison.isEqual) {
        modified.push({ agentId: pulledInfo.agentId, subAgentId });
      }
    }
  }
  
  return { added, modified, deleted };
}

/**
 * Calculate total number of changes
 */
function calculateTotalChanges(diff: ProjectDiff): number {
  let total = 0;
  if (diff.projectInfo) total += 1;
  
  const componentTypes = ['agents', 'tools', 'functions', 'dataComponents', 'artifactComponents', 'credentials'] as const;
  for (const type of componentTypes) {
    total += diff[type].added.length;
    total += diff[type].modified.length;
    total += diff[type].deleted.length;
  }
  
  total += diff.subAgents.added.length;
  total += diff.subAgents.modified.length;
  total += diff.subAgents.deleted.length;
  
  return total;
}

/**
 * Get list of affected component types
 */
function getAffectedTypes(diff: ProjectDiff): string[] {
  const affected: string[] = [];
  
  if (diff.projectInfo) affected.push('project');
  
  const componentTypes = ['agents', 'tools', 'functions', 'dataComponents', 'artifactComponents', 'credentials'] as const;
  for (const type of componentTypes) {
    const changes = diff[type];
    if (changes.added.length > 0 || changes.modified.length > 0 || changes.deleted.length > 0) {
      affected.push(type);
    }
  }
  
  if (diff.subAgents.added.length > 0 || diff.subAgents.modified.length > 0 || diff.subAgents.deleted.length > 0) {
    affected.push('subAgents');
  }
  
  return affected;
}

/**
 * Get a human-readable summary of the diff
 */
export function getDiffSummary(diff: ProjectDiff): string {
  if (!diff.hasChanges) {
    return '✅ No changes detected';
  }
  
  const lines: string[] = [];
  lines.push(`📊 Found ${diff.summary.totalChanges} changes across ${diff.summary.affectedComponentTypes.length} component types`);
  
  if (diff.projectInfo) {
    lines.push('  • Project info changed (name, description, or models)');
  }
  
  const componentTypes = ['agents', 'tools', 'functions', 'dataComponents', 'artifactComponents', 'credentials'] as const;
  for (const type of componentTypes) {
    const changes = diff[type];
    const total = changes.added.length + changes.modified.length + changes.deleted.length;
    if (total > 0) {
      const details = [];
      if (changes.added.length > 0) details.push(`${changes.added.length} added`);
      if (changes.modified.length > 0) details.push(`${changes.modified.length} modified`);
      if (changes.deleted.length > 0) details.push(`${changes.deleted.length} deleted`);
      lines.push(`  • ${type}: ${details.join(', ')}`);
    }
  }
  
  const subAgentTotal = diff.subAgents.added.length + diff.subAgents.modified.length + diff.subAgents.deleted.length;
  if (subAgentTotal > 0) {
    const details = [];
    if (diff.subAgents.added.length > 0) details.push(`${diff.subAgents.added.length} added`);
    if (diff.subAgents.modified.length > 0) details.push(`${diff.subAgents.modified.length} modified`);
    if (diff.subAgents.deleted.length > 0) details.push(`${diff.subAgents.deleted.length} deleted`);
    lines.push(`  • subAgents: ${details.join(', ')}`);
  }
  
  return lines.join('\n');
}