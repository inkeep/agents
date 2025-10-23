import type { FullProjectDefinition } from '@inkeep/agents-core';

export interface ComparisonResult {
  matches: boolean;
  differences: string[];
  warnings: string[];
}


/**
 * Deep compare two FullProjectDefinition objects
 *
 * Ignores timestamp fields (createdAt, updatedAt) and provides detailed
 * error messages about specific differences.
 *
 * @param original - The original project definition from the backend
 * @param generated - The generated project definition from loaded TypeScript
 * @returns Comparison result with matches boolean and list of differences
 */
export function compareProjectDefinitions(
  original: FullProjectDefinition,
  generated: FullProjectDefinition
): ComparisonResult {
  const differences: string[] = [];
  const warnings: string[] = [];

  // Helper to compare primitive values
  const comparePrimitive = (path: string, a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b) {
      differences.push(`Type mismatch at ${path}: ${typeof a} vs ${typeof b}`);
      return false;
    }
    if (a !== b) {
      differences.push(`Value mismatch at ${path}: "${a}" vs "${b}"`);
      return false;
    }
    return true;
  };

  // Helper to compare arrays
  const compareArrays = (path: string, a: any[], b: any[]): boolean => {
    if (a.length !== b.length) {
      differences.push(`Array length mismatch at ${path}: ${a.length} vs ${b.length}`);
      return false;
    }
    
    // For certain paths, treat arrays as sets (order doesn't matter)
    const orderIndependentPaths = ['canDelegateTo', 'tools', 'functionTools'];
    const isOrderIndependent = orderIndependentPaths.some(pattern => path.includes(pattern));
    
    if (isOrderIndependent) {
      // Compare as sets - all elements in a must exist in b
      const aSet = new Set(a.map(item => typeof item === 'object' ? JSON.stringify(item) : item));
      const bSet = new Set(b.map(item => typeof item === 'object' ? JSON.stringify(item) : item));
      
      if (aSet.size !== bSet.size) {
        differences.push(`Array content mismatch at ${path}: different unique elements`);
        return false;
      }
      
      for (const item of aSet) {
        if (!bSet.has(item)) {
          differences.push(`Array content mismatch at ${path}: missing element ${item}`);
          return false;
        }
      }
      
      return true;
    } else {
      // Compare as ordered arrays (original behavior)
      let allMatch = true;
      for (let i = 0; i < a.length; i++) {
        if (!compareValues(`${path}[${i}]`, a[i], b[i])) {
          allMatch = false;
        }
      }
      return allMatch;
    }
  };

  // Helper to compare objects
  const compareObjects = (path: string, a: any, b: any): boolean => {
    // Ignore timestamp fields (contextConfig IDs are now deterministic)
    const ignoredFields = ['createdAt', 'updatedAt'];
    
    const aKeys = Object.keys(a || {}).filter((k) => !ignoredFields.includes(k));
    const bKeys = Object.keys(b || {}).filter((k) => !ignoredFields.includes(k));

    // Check for missing keys, but ignore fields that are null/empty in API but omitted in SDK
    const dbGeneratedFields = ['agentToolRelationId']; // Database-generated IDs that should be ignored entirely
    
    const missingInB = aKeys.filter((k) => 
      !bKeys.includes(k) && 
      a[k] !== null &&  // Ignore if API has null (SDK omits null fields)
      !(Array.isArray(a[k]) && a[k].length === 0) && // Ignore if API has empty array
      !(typeof a[k] === 'object' && a[k] !== null && Object.keys(a[k]).length === 0) && // Ignore if API has empty object
      !dbGeneratedFields.includes(k)
    );
    const extraInB = bKeys.filter((k) => 
      !aKeys.includes(k) && 
      b[k] !== null &&  // Ignore if SDK has null (API might omit null fields)  
      !(Array.isArray(b[k]) && b[k].length === 0) && // Ignore if SDK has empty array
      !(typeof b[k] === 'object' && b[k] !== null && Object.keys(b[k]).length === 0) && // Ignore if SDK has empty object
      !dbGeneratedFields.includes(k)
    );

    if (missingInB.length > 0) {
      differences.push(`Missing keys in generated at ${path}: ${missingInB.join(', ')}`);
    }
    if (extraInB.length > 0) {
      warnings.push(`Extra keys in generated at ${path}: ${extraInB.join(', ')}`);
    }

    let allMatch = true;
    for (const key of aKeys) {
      if (bKeys.includes(key)) {
        if (!compareValues(`${path}.${key}`, a[key], b[key])) {
          allMatch = false;
        }
      }
    }

    return allMatch && missingInB.length === 0;
  };

  // Main comparison function
  const compareValues = (path: string, a: any, b: any): boolean => {
    // Prevent infinite recursion with depth check
    const depth = (path.match(/\./g) || []).length;
    if (depth > 50) {
      warnings.push(`Max comparison depth reached at ${path}`);
      return true; // Consider deeply nested paths as equivalent to avoid hangs
    }

    // Handle null/undefined equivalence - API returns null, SDK returns undefined
    if (a === null && b === null) return true;
    if (a === undefined && b === undefined) return true;
    if ((a === null && b === undefined) || (a === undefined && b === null)) return true;
    
    // Handle empty array vs undefined equivalence - API returns [], SDK returns undefined
    if (Array.isArray(a) && a.length === 0 && b === undefined) return true;
    if (a === undefined && Array.isArray(b) && b.length === 0) return true;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      return compareArrays(path, a, b);
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
      differences.push(`Array type mismatch at ${path}`);
      return false;
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      return compareObjects(path, a, b);
    }

    // Handle primitives
    return comparePrimitive(path, a, b);
  };

  // Compare top-level fields
  comparePrimitive('id', original.id, generated.id);
  comparePrimitive('name', original.name, generated.name);

  // Description can be empty string vs undefined
  if (original.description || generated.description) {
    const origDesc = original.description || '';
    const genDesc = generated.description || '';
    if (origDesc !== genDesc) {
      comparePrimitive('description', origDesc, genDesc);
    }
  }

  // Compare models configuration
  if (original.models || generated.models) {
    compareValues('models', original.models, generated.models);
  }

  // Compare stopWhen configuration
  if (original.stopWhen || generated.stopWhen) {
    compareValues('stopWhen', original.stopWhen, generated.stopWhen);
  }

  // Compare agents
  const originalAgentIds = Object.keys(original.agents || {});
  const generatedAgentIds = Object.keys(generated.agents || {});

  if (originalAgentIds.length !== generatedAgentIds.length) {
    differences.push(
      `Agent count mismatch: ${originalAgentIds.length} vs ${generatedAgentIds.length}`
    );
  }

  for (const agentId of originalAgentIds) {
    if (!generatedAgentIds.includes(agentId)) {
      differences.push(`Missing agent in generated: ${agentId}`);
    } else {
      compareValues(
        `agents.${agentId}`,
        original.agents?.[agentId],
        generated.agents?.[agentId]
      );
    }
  }

  for (const agentId of generatedAgentIds) {
    if (!originalAgentIds.includes(agentId)) {
      warnings.push(`Extra agent in generated: ${agentId}`);
    }
  }

  // Compare tools
  const originalToolIds = Object.keys(original.tools || {});
  const generatedToolIds = Object.keys(generated.tools || {});

  if (originalToolIds.length !== generatedToolIds.length) {
    differences.push(`Tool count mismatch: ${originalToolIds.length} vs ${generatedToolIds.length}`);
  }

  for (const toolId of originalToolIds) {
    if (!generatedToolIds.includes(toolId)) {
      differences.push(`Missing tool in generated: ${toolId}`);
    } else {
      compareValues(`tools.${toolId}`, original.tools?.[toolId], generated.tools?.[toolId]);
    }
  }

  // Compare functions (if present)
  if (original.functions || generated.functions) {
    const originalFunctionIds = Object.keys(original.functions || {});
    const generatedFunctionIds = Object.keys(generated.functions || {});

    for (const functionId of originalFunctionIds) {
      if (!generatedFunctionIds.includes(functionId)) {
        differences.push(`Missing function in generated: ${functionId}`);
      } else {
        compareValues(
          `functions.${functionId}`,
          original.functions?.[functionId],
          generated.functions?.[functionId]
        );
      }
    }
  }

  // Compare data components
  if (original.dataComponents || generated.dataComponents) {
    const originalComponentIds = Object.keys(original.dataComponents || {});
    const generatedComponentIds = Object.keys(generated.dataComponents || {});

    for (const componentId of originalComponentIds) {
      if (!generatedComponentIds.includes(componentId)) {
        differences.push(`Missing data component in generated: ${componentId}`);
      } else {
        compareValues(
          `dataComponents.${componentId}`,
          original.dataComponents?.[componentId],
          generated.dataComponents?.[componentId]
        );
      }
    }
  }

  // Compare artifact components
  if (original.artifactComponents || generated.artifactComponents) {
    const originalArtifactIds = Object.keys(original.artifactComponents || {});
    const generatedArtifactIds = Object.keys(generated.artifactComponents || {});

    for (const artifactId of originalArtifactIds) {
      if (!generatedArtifactIds.includes(artifactId)) {
        differences.push(`Missing artifact component in generated: ${artifactId}`);
      } else {
        compareValues(
          `artifactComponents.${artifactId}`,
          original.artifactComponents?.[artifactId],
          generated.artifactComponents?.[artifactId]
        );
      }
    }
  }

  // Compare credential references (if present)
  if (original.credentialReferences || generated.credentialReferences) {
    const originalCredIds = Object.keys(original.credentialReferences || {});
    const generatedCredIds = Object.keys(generated.credentialReferences || {});

    for (const credId of originalCredIds) {
      if (!generatedCredIds.includes(credId)) {
        differences.push(`Missing credential reference in generated: ${credId}`);
      } else {
        // Ignore usedBy field in credentials as it's computed
        const origCred = { ...(original.credentialReferences?.[credId] as any || {}) };
        const genCred = { ...(generated.credentialReferences?.[credId] as any || {}) };
        delete origCred.usedBy;
        delete genCred.usedBy;
        compareValues(`credentialReferences.${credId}`, origCred, genCred);
      }
    }
  }

  return {
    matches: differences.length === 0,
    differences,
    warnings,
  };
}
