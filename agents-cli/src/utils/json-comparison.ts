import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';

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

  // Define ignored fields at the top level so all helper functions can access them
  const dbGeneratedFields = ['agentToolRelationId']; // Database-generated IDs that should be ignored entirely
  const sdkGeneratedFields = ['type']; // SDK-generated metadata fields that should be ignored
  const contextFields = ['tenantId', 'projectId', 'agentId']; // Runtime context fields added by SDK
  const cosmenticFields = ['imageUrl']; // Cosmetic UI fields that don't affect functionality
  const allIgnoredFields = [...dbGeneratedFields, ...sdkGeneratedFields, ...contextFields, ...cosmenticFields];

  // Helper to check if a value is "empty" (undefined, empty object, or empty array)
  const isEmpty = (value: any): boolean => {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
  };

  // Helper to check if this is a schema-related field that should have stricter comparison
  const isSchemaField = (path: string): boolean => {
    return path.endsWith('.props') || 
           path.endsWith('.schema') || 
           path.endsWith('Schema') ||
           path.includes('.props.') ||
           path.includes('.schema.');
  };

  // Helper to check if an object has actual content (not just empty)
  const hasContent = (value: any): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.length > 0;
    return Object.keys(value).length > 0;
  };

  // Helper to compare primitive values
  const comparePrimitive = (path: string, a: any, b: any): boolean => {
    if (a === b) return true;
    
    // For schema fields, be stricter about empty vs populated
    if (isSchemaField(path)) {
      const aHasContent = hasContent(a);
      const bHasContent = hasContent(b);
      
      // If one has content and the other doesn't, they're not equivalent
      if (aHasContent !== bHasContent) {
        return false;
      }
      
      // Both empty or both have content - continue with normal comparison
      if (!aHasContent && !bHasContent) {
        // Both are empty - treat as equivalent
        return true;
      }
    } else {
      // For non-schema fields, treat empty values as equivalent (undefined, {}, [])
      if (isEmpty(a) && isEmpty(b)) {
        return true;
      }
    }
    
    // Special handling for credential fields - SDK may return object while API returns string ID
    if (path.includes('credential') || path.endsWith('ReferenceId')) {
      // If one is a string (ID) and the other is an object with an id field, compare IDs
      if (typeof a === 'string' && typeof b === 'object' && b !== null && 'id' in b) {
        return a === b.id;
      }
      if (typeof b === 'string' && typeof a === 'object' && a !== null && 'id' in a) {
        return b === a.id;
      }
    }
    
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
    const orderIndependentPaths = [
      'canDelegateTo', 
      'canTransferTo', 
      'canUse',
      'tools', 
      'functionTools', 
      'dataComponents', 
      'artifactComponents'
    ];
    const isOrderIndependent = orderIndependentPaths.some(pattern => path.includes(pattern));
    
    if (isOrderIndependent) {
      // Compare as sets - all elements in a must exist in b
      // Filter out ignored fields before comparison
      const allIgnoredFields = [...dbGeneratedFields, ...sdkGeneratedFields, ...contextFields];
      
      const filterIgnoredFields = (item: any) => {
        if (typeof item === 'object' && item !== null) {
          const filtered = { ...item };
          allIgnoredFields.forEach(field => delete filtered[field]);
          return JSON.stringify(filtered);
        }
        return item;
      };
      
      const aSet = new Set(a.map(filterIgnoredFields));
      const bSet = new Set(b.map(filterIgnoredFields));
      
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
    
    const missingInB = aKeys.filter((k) => 
      !bKeys.includes(k) && 
      a[k] !== null &&  // Ignore if API has null (SDK omits null fields)
      !(Array.isArray(a[k]) && a[k].length === 0) && // Ignore if API has empty array
      !(typeof a[k] === 'object' && a[k] !== null && Object.keys(a[k]).length === 0) && // Ignore if API has empty object
      !allIgnoredFields.includes(k) &&
      // Ignore $schema fields which are typically added automatically by JSON schema serialization
      k !== '$schema' &&
      // Ignore common JSON Schema metadata fields that generators don't include but API adds
      !(k === 'properties' && path.includes('.schema')) &&
      !(k === 'required' && path.includes('.schema')) &&
      !(k === 'additionalProperties' && path.includes('.schema'))
    );
    const extraInB = bKeys.filter((k) => 
      !aKeys.includes(k) && 
      b[k] !== null &&  // Ignore if SDK has null (API might omit null fields)  
      !(Array.isArray(b[k]) && b[k].length === 0) && // Ignore if SDK has empty array
      !(typeof b[k] === 'object' && b[k] !== null && Object.keys(b[k]).length === 0) && // Ignore if SDK has empty object
      !allIgnoredFields.includes(k) &&
      // Ignore $schema fields which are typically added automatically by JSON schema serialization
      k !== '$schema' &&
      // Ignore extra JSON Schema metadata fields that generators might add but API doesn't expect
      !(k === 'additionalProperties' && path.includes('.props'))
    );

    if (missingInB.length > 0) {
      differences.push(`Missing keys in generated at ${path}: ${missingInB.join(', ')}`);
    }
    if (extraInB.length > 0) {
      // Split extra keys into meaningful content vs empty content
      const meaningfulExtraKeys = [];
      const emptyExtraKeys = [];
      
      for (const key of extraInB) {
        const value = b[key];
        const isEmpty = value === null || 
                       value === undefined ||
                       value === '' ||
                       (Array.isArray(value) && value.length === 0) ||
                       (typeof value === 'object' && value !== null && Object.keys(value).length === 0);
        
        if (isEmpty) {
          emptyExtraKeys.push(key);
        } else {
          meaningfulExtraKeys.push(key);
        }
      }
      
      // Meaningful extra content = real difference (generated files out of sync)
      if (meaningfulExtraKeys.length > 0) {
        differences.push(`Extra keys in generated at ${path}: ${meaningfulExtraKeys.join(', ')}`);
      }
      // Empty extra content = just warning (probably harmless metadata)
      if (emptyExtraKeys.length > 0) {
        warnings.push(`Extra keys in generated at ${path}: ${emptyExtraKeys.join(', ')}`);
      }
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
    
    // Handle empty object vs undefined equivalence - API returns {}, SDK returns undefined
    if (typeof a === 'object' && a !== null && Object.keys(a).length === 0 && b === undefined) return true;
    if (a === undefined && typeof b === 'object' && b !== null && Object.keys(b).length === 0) return true;

    // Handle model inheritance - when generators inherit models from parent configs,
    // they may omit model fields that match inherited values, resulting in undefined
    // while API always returns explicit model objects. This is expected behavior.
    if (path.includes('.models') && 
        typeof a === 'object' && a !== null && 
        b === undefined) {
      // Check if the model object represents a "default" or inherited configuration
      // by looking for minimal required fields like 'model' property or typical model structure
      const hasMinimalModelStructure = a.model || a.provider || 
                                      (typeof a === 'object' && (a.base || a.fast || a.smart));
      if (hasMinimalModelStructure) {
        warnings.push(`Model inheritance at ${path}: API has explicit model config, generator uses inheritance (this is expected)`);
        return true; // Treat as equivalent - inheritance is working as designed
      }
    }
    
    // Reverse case - generator has model but API doesn't (less common)
    if (path.includes('.models') && 
        a === undefined && 
        typeof b === 'object' && b !== null) {
      const hasMinimalModelStructure = b.model || b.provider ||
                                      (typeof b === 'object' && (b.base || b.fast || b.smart));
      if (hasMinimalModelStructure) {
        warnings.push(`Model inheritance at ${path}: generator has explicit model config, API uses inheritance (this is expected)`);
        return true;
      }
    }

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

  // Compare project-level function tools (if present)
  if (original.functionTools || generated.functionTools) {
    const originalFunctionToolIds = Object.keys(original.functionTools || {});
    const generatedFunctionToolIds = Object.keys(generated.functionTools || {});

    if (originalFunctionToolIds.length !== generatedFunctionToolIds.length) {
      differences.push(`Function tool count mismatch: ${originalFunctionToolIds.length} vs ${generatedFunctionToolIds.length}`);
    }

    for (const functionToolId of originalFunctionToolIds) {
      if (!generatedFunctionToolIds.includes(functionToolId)) {
        differences.push(`Missing function tool in generated: ${functionToolId}`);
      } else {
        compareValues(
          `functionTools.${functionToolId}`,
          original.functionTools?.[functionToolId],
          generated.functionTools?.[functionToolId]
        );
      }
    }

    for (const functionToolId of generatedFunctionToolIds) {
      if (!originalFunctionToolIds.includes(functionToolId)) {
        warnings.push(`Extra function tool in generated: ${functionToolId}`);
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
