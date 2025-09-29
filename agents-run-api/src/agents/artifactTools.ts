import type { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { tool } from 'ai';
import jmespath from 'jmespath';
import { nanoid } from 'nanoid';
import z from 'zod';
import { getLogger } from '../logger';
import { graphSessionManager } from '../services/GraphSession';
import { parseEmbeddedJson } from '../utils/json-parser';
import { toolSessionManager } from './ToolSessionManager';

const logger = getLogger('artifactTools');

function buildKeyNestingMap(data: any, prefix = '', map = new Map()) {
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      // For arrays, analyze the first few items
      data.slice(0, 3).forEach((item, index) => {
        buildKeyNestingMap(item, `${prefix}[${index}]`, map);
      });
    } else {
      Object.keys(data).forEach((key) => {
        const fullPath = prefix ? `${prefix}.${key}` : key;

        // Store all paths where this key appears
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(fullPath);

        // Recurse into nested objects
        buildKeyNestingMap(data[key], fullPath, map);
      });
    }
  }
  return map;
}

function analyzeSelectorFailure(data: any, selector: string) {
  const analysis = [];
  const suggestions = [];
  let availableKeys: string[] = [];

  try {
    // Build a complete map of where each key appears
    const keyNestingMap = buildKeyNestingMap(data);

    // Get top-level keys
    if (typeof data === 'object' && data !== null) {
      availableKeys = Object.keys(data);
    }

    // Check for quote mismatches in filters
    const filterMatches = selector.match(/\[.*?\]/g);
    if (filterMatches) {
      filterMatches.forEach((filter) => {
        const hasSingleQuote = filter.includes("'");
        const hasDoubleQuote = filter.includes('"');
        if (hasSingleQuote && hasDoubleQuote) {
          analysis.push('MIXED QUOTES in filter');
          suggestions.push('Use consistent quotes in filter conditions');
        }
      });
    }

    // Extract the target key from selector (the key we're trying to reach)
    const selectorParts = selector.split('.').filter((part) => part && !part.startsWith('['));
    const targetKey = selectorParts[selectorParts.length - 1]?.replace(/\[.*?\]/g, '');

    // Walk the selector path to find where it breaks
    let currentData = data;
    let validPath = '';
    let pathBroken = false;

    for (let i = 0; i < selectorParts.length; i++) {
      const part = selectorParts[i].replace(/\[.*?\]/g, '');
      if (part && currentData && typeof currentData === 'object') {
        if (!(part in currentData)) {
          const pathSoFar = validPath || 'root';
          analysis.push(`KEY "${part}" not found at ${pathSoFar}`);

          // Use the nesting map to suggest alternative paths
          if (keyNestingMap.has(part)) {
            const allPaths = keyNestingMap.get(part);
            const relevantPaths = allPaths.filter(
              (path: string) => path.includes(validPath) || validPath === ''
            );
            if (relevantPaths.length > 0) {
              suggestions.push(`"${part}" exists at: ${relevantPaths.slice(0, 3).join(', ')}`);
            }
          }
          pathBroken = true;
          break;
        }
        currentData = currentData[part];
        validPath = validPath ? `${validPath}.${part}` : part;
      }
    }

    // If path is valid but selector still failed, it's likely a filter issue with nested data
    if (!pathBroken && targetKey && keyNestingMap.has(targetKey)) {
      analysis.push('PATH VALID BUT FILTER FAILED');
      const allPaths = keyNestingMap.get(targetKey);
      const deeperPaths = allPaths.filter(
        (path: string) => path.length > selector.replace(/\[.*?\]/g, '').length
      );
      if (deeperPaths.length > 0) {
        suggestions.push(
          `"${targetKey}" also found deeper at: ${deeperPaths.slice(0, 3).join(', ')}`
        );
        suggestions.push('Try a deeper path or check filter values');
      }
    }

    if (analysis.length === 0) {
      analysis.push('UNKNOWN SELECTOR ISSUE');
    }
  } catch (_debugError) {
    analysis.push('SYNTAX ERROR');
    suggestions.push('Check JMESPath syntax');
  }

  return { analysis, suggestions, availableKeys };
}

function createPropSelectorsSchema(artifactComponents?: ArtifactComponentApiInsert[]) {
  if (!artifactComponents || artifactComponents.length === 0) {
    return z
      .record(z.string(), z.string())
      .describe(
        'Prop selectors mapping schema properties to JMESPath expressions relative to base selector'
      );
  }

  // Create a union of all possible prop selector schemas based on artifact components
  const propSelectorSchemas = artifactComponents.map((ac) => {
    const _props =
      ac.summaryProps ||
      ac.fullProps ||
      ({} as {
        properties?: Record<string, any>;
        required?: string[];
      });

    // Create schema object for each property in the artifact component
    const propSchema: Record<string, any> = {};

    // Add properties from summaryProps schema
    if (ac.summaryProps && typeof ac.summaryProps === 'object') {
      const summaryProps = ac.summaryProps as { properties?: Record<string, any> };
      if (summaryProps.properties) {
        Object.entries(summaryProps.properties).forEach(([propName, propDef]: [string, any]) => {
          const propDescription = propDef?.description || propDef?.title || `${propName} property`;
          propSchema[propName] = z
            .string()
            .describe(
              `JMESPath selector for ${propName} (${propDescription}) - summary version, MUST be relative to your baseSelector target level. Access fields WITHIN the items your baseSelector returns.`
            );
        });
      }
    }

    // Add properties from fullProps schema
    if (ac.fullProps && typeof ac.fullProps === 'object') {
      const fullProps = ac.fullProps as { properties?: Record<string, any> };
      if (fullProps.properties) {
        Object.entries(fullProps.properties).forEach(([propName, propDef]: [string, any]) => {
          // Don't overwrite if already exists from summary
          if (!propSchema[propName]) {
            const propDescription =
              propDef?.description || propDef?.title || `${propName} property`;
            propSchema[propName] = z
              .string()
              .describe(
                `JMESPath selector for ${propName} (${propDescription}) - MUST be relative to your baseSelector target level. If baseSelector stops at a document, this accesses fields WITHIN that document. Examples: "title", "content.body", "metadata.author"`
              );
          }
        });
      }
    }

    return z.object(propSchema).describe(`Prop selectors for ${ac.name} artifact`);
  });

  // Return union of all prop selector schemas or fallback to generic record
  if (propSelectorSchemas.length === 1) {
    return propSelectorSchemas[0];
  } else if (propSelectorSchemas.length > 1) {
    return z.union(propSelectorSchemas as [any, any, ...any[]]);
  }

  return z
    .record(z.string(), z.string())
    .describe(
      'Prop selectors mapping schema properties to JMESPath expressions relative to base selector. Each path is relative to the item(s) your baseSelector returns.\n\n' +
        '🎯 CRITICAL: PropSelectors work ONLY on the data your baseSelector returns!\n' +
        'If baseSelector = "result.docs[0]" → propSelectors access fields INSIDE that doc\n' +
        'If baseSelector = "result.docs[0].content[0]" → propSelectors access fields INSIDE that content item\n\n' +
        '✅ CORRECT EXAMPLES (paths relative to baseSelector target):\n' +
        '• baseSelector: "result.documents[?type==\'article\']" → propSelectors: {"title": "title", "url": "url"}\n' +
        '• baseSelector: "result.content[0].text" → propSelectors: {"content": "content[0].text", "source": "content[0].source"}\n' +
        '• baseSelector: "result.items" → propSelectors: {"name": "profile.name", "email": "contact.email"}\n\n' +
        '❌ WRONG EXAMPLES (accessing data not at baseSelector level):\n' +
        '• baseSelector: "result.docs[0].content[0]" → propSelectors: {"title": "title"} ← title is at doc level, not content level!\n' +
        '• baseSelector: "result.source.content" → propSelectors: {"title": "content[4].text"} ← baseSelector ends at array, can\'t index into it!\n' +
        '• baseSelector: "result.items" → propSelectors: {"title": "documents[0].title"} ← going deeper when baseSelector should handle depth\n\n' +
        '❌ NEVER USE LITERAL VALUES:\n' +
        '{"title": "Robert Tran", "url": "https://linkedin.com/..."}\n\n' +
        '💡 TIP: Match your baseSelector depth to where the properties you need actually exist!'
    );
}

function createInputSchema(artifactComponents?: ArtifactComponentApiInsert[]) {
  const baseSchema = z.object({
    toolCallId: z
      .string()
      .describe(
        'EXACT toolCallId from a previous tool execution - copy it exactly from the tool call result. NEVER invent or make up tool call IDs.'
      ),
    baseSelector: z
      .string()
      .describe(
        'JMESPath selector to get to the main data array/object. ALWAYS start with "result." That is a mandatory prefix.\n\n' +
          'Data structures are COMPLEX and NESTED. Examples:\n' +
          '• "result.content[0].text.content[2]" - parsed JSON in text field\n' +
          '• "result.structuredContent.content[1]" - direct structured data\n' +
          '• "result.data.items[?type==\'doc\']" - filtered array\n\n' +
          '🚨 CRITICAL: If you need data from array[4], your baseSelector must END at array[4], NOT at the array itself!\n' +
          '✅ CORRECT: "result.source.content[4]" → propSelectors can access fields in that item\n' +
          '❌ WRONG: "result.source.content" → propSelectors can\'t use content[4] because baseSelector already selected the array\n\n' +
          '🔥 IF YOUR PATH FAILS: READ THE ERROR MESSAGE! It tells you the correct path! 🔥'
      ),
    propSelectors: createPropSelectorsSchema(artifactComponents),
  });

  // If no artifact components, return base schema
  if (!artifactComponents || artifactComponents.length === 0) {
    return baseSchema;
  }

  // Add artifactType selection based on available artifact components
  return baseSchema.extend({
    artifactType: z
      .enum(artifactComponents.map((ac) => ac.name) as [string, ...string[]])
      .describe(
        `Type of artifact to create. Available types: ${artifactComponents.map((ac) => ac.name).join(', ')}`
      ),
  });
}

export function createSaveToolResultTool(
  sessionId?: string,
  streamRequestId?: string, // For GraphSession recording
  agentId?: string,
  artifactComponents?: ArtifactComponentApiInsert[]
) {
  const inputSchema = createInputSchema(artifactComponents);

  // Create available types with descriptions for better context
  const availableTypesWithDescriptions = artifactComponents?.length
    ? artifactComponents
        .map((ac) => `- ${ac.name}: ${ac.description || 'No description available'}`)
        .join('\n')
    : 'Generic artifacts';

  return tool({
    description: `Save tool results as structured artifacts. Each artifact should represent ONE SPECIFIC, IMPORTANT, and UNIQUE document or data item.

⚡ CRITICAL: JSON-like text content in tool results is AUTOMATICALLY PARSED into proper JSON objects - treat all data as structured, not text strings.
🚨 CRITICAL: Data structures are deeply nested. When your path fails, READ THE ERROR MESSAGE - it shows the correct path!

AVAILABLE ARTIFACT TYPES:
${availableTypesWithDescriptions}

🚨 FUNDAMENTAL RULE: ONE ARTIFACT = ONE SEPARATE DATA COMPONENT 🚨

Each artifact you save becomes a SEPARATE DATA COMPONENT in the structured response:
✅ A SINGLE, SPECIFIC document (e.g., one specific API endpoint, one specific person's profile, one specific error)
✅ IMPORTANT and directly relevant to the user's question  
✅ UNIQUE with distinct value from other artifacts
✅ RENDERED AS INDIVIDUAL DATA COMPONENT in the UI

USAGE PATTERN:
1. baseSelector: Navigate through nested structures to target ONE SPECIFIC item
   - Navigate through all necessary levels: "result.data.items.nested[?condition]"
   - Handle nested structures properly: "result.content.content[?field1=='value']" is fine if that's the structure
   - Use [?condition] filtering to get exactly the item you want
   - Example: "result.items[?field_a=='target_value' && field_b=='specific_type']"
   - NOT: "result.items[*]" (too broad, gets everything)

2. propSelectors: Extract properties relative to your selected item
   - 🎯 CRITICAL: Always relative to the single item that baseSelector returns
   - If baseSelector ends at a document → propSelectors access document fields
   - If baseSelector ends at content[0] → propSelectors access content[0] fields
   - Simple paths from that exact level: { prop1: "field_x", prop2: "nested.field_y" }
   - ❌ DON'T try to go back up or deeper - adjust your baseSelector instead!

3. Result: ONE artifact representing ONE important, unique item → ONE data component

💡 HANDLING NESTED STRUCTURES:
- Navigate as deep as needed: "result.data.items.content.documents[?condition]" is fine
- Focus on getting to the right level with baseSelector, then keep propSelectors simple
- Test your baseSelector: Does it return exactly the items you want?

Please use Error Messages to Debug when there is an error in the tool call.`,
    inputSchema,
    execute: async ({ toolCallId, baseSelector, propSelectors, ...rest }, _context?: any) => {
      const artifactType = 'artifactType' in rest ? (rest.artifactType as string) : undefined;

      if (!sessionId) {
        logger.warn({ toolCallId }, 'No session ID provided to save_tool_result');
        return {
          saved: false,
          error: `[toolCallId: ${toolCallId}] No session context available`,
          artifactIds: [],
          warnings: [],
        };
      }

      // Get the tool result from the session
      const toolResult = toolSessionManager.getToolResult(sessionId, toolCallId);
      if (!toolResult) {
        logger.warn({ toolCallId, sessionId }, 'Tool result not found in session');
        return {
          saved: false,
          error: `[toolCallId: ${toolCallId}] Tool result not found`,
          artifactIds: [],
          warnings: [],
        };
      }

      try {
        const parsedResult = parseEmbeddedJson(toolResult);

        // Use baseSelector to get to the main data
        const baseData = jmespath.search(parsedResult, baseSelector);
        if (!baseData || (Array.isArray(baseData) && baseData.length === 0)) {
          // Enhanced debugging for failed selectors
          const debugInfo = analyzeSelectorFailure(parsedResult, baseSelector);

          logger.warn(
            {
              baseSelector,
              toolCallId,
              analysis: debugInfo.analysis,
              suggestions: debugInfo.suggestions,
              availableKeys: debugInfo.availableKeys,
            },
            'Base selector returned no results - selector may be incorrect'
          );

          const errorMessage = [
            `[toolCallId: ${toolCallId}] Base selector "${baseSelector}" returned no results.`,
            '',
            `🔍 DETECTED ISSUES: ${debugInfo.analysis.join(' | ')}`,
            '',
            '💡 SUGGESTIONS:',
            ...debugInfo.suggestions.map((s) => `  • ${s}`),
            '',
            `📊 AVAILABLE TOP-LEVEL KEYS: ${debugInfo.availableKeys.join(', ')}`,
          ].join('\n');

          return {
            saved: false,
            error: errorMessage,
            artifactIds: [],
            warnings: [],
          };
        }

        // Helper function to extract properties from items based on schema
        const extractProps = (items: any[], schema: any, context: string = 'default') => {
          const failedSelectors: string[] = [];

          const extractedItems = items.map((item, _index) => {
            const extractedItem: Record<string, any> = {};
            const schemaProperties = schema?.properties || {};

            for (const [propName, _propSchema] of Object.entries(schemaProperties)) {
              const propSelector = propSelectors[propName];
              if (propSelector) {
                try {
                  const propValue = jmespath.search(item, propSelector);
                  if (propValue !== null && propValue !== undefined) {
                    extractedItem[propName] = propValue;
                  } else {
                    // PropSelector didn't match anything - try fallback to direct property access
                    const fallbackValue = item[propName];
                    if (fallbackValue !== null && fallbackValue !== undefined) {
                      extractedItem[propName] = fallbackValue;
                      logger.info(
                        { propName, propSelector, context },
                        `PropSelector failed, used fallback direct property access`
                      );
                    } else {
                      failedSelectors.push(`${propName}: "${propSelector}"`);
                    }
                  }
                } catch (error) {
                  // JMESPath syntax error - try fallback
                  const fallbackValue = item[propName];
                  if (fallbackValue !== null && fallbackValue !== undefined) {
                    extractedItem[propName] = fallbackValue;
                    logger.warn(
                      { propName, propSelector, context, error: (error as Error).message },
                      `PropSelector syntax error, used fallback direct property access`
                    );
                  } else {
                    failedSelectors.push(`${propName}: "${propSelector}" (syntax error)`);
                  }
                }
              }
            }
            return extractedItem;
          });

          // Return both the extracted items and any failed selectors for error reporting
          return { extractedItems, failedSelectors };
        };

        // Find the matching artifact component
        const targetArtifactComponent = artifactComponents?.find((ac) => ac.name === artifactType);

        // Normalize baseData to always be an array
        const dataItems = Array.isArray(baseData) ? baseData : [baseData];

        // Extract data based on dataComponent configuration
        let summaryData: any[];
        let fullData: any[];
        const allFailedSelectors: string[] = [];

        if (targetArtifactComponent?.summaryProps || targetArtifactComponent?.fullProps) {
          // ArtifactComponent format - summaryProps and fullProps are direct properties
          if (targetArtifactComponent.summaryProps) {
            const summaryResult = extractProps(
              dataItems,
              targetArtifactComponent.summaryProps,
              'summary'
            );
            summaryData = summaryResult.extractedItems;
            allFailedSelectors.push(...summaryResult.failedSelectors.map((s) => `summary.${s}`));
          } else {
            summaryData = [];
          }

          if (targetArtifactComponent.fullProps) {
            const fullResult = extractProps(dataItems, targetArtifactComponent.fullProps, 'full');
            fullData = fullResult.extractedItems;
            allFailedSelectors.push(...fullResult.failedSelectors.map((s) => `full.${s}`));
          } else {
            fullData = [];
          }
        } else {
          // Backward compatibility: use all propSelectors (current behavior)
          const allPropsSchema = {
            properties: Object.keys(propSelectors).reduce(
              (acc, key) => {
                acc[key] = {}; // Schema doesn't matter for this case
                return acc;
              },
              {} as Record<string, any>
            ),
          };

          const structuredResult = extractProps(dataItems, allPropsSchema, 'structured');
          summaryData = structuredResult.extractedItems;
          fullData = structuredResult.extractedItems;
          allFailedSelectors.push(...structuredResult.failedSelectors);
        }

        // If there are failed selectors, include them in the response as warnings
        const warnings =
          allFailedSelectors.length > 0
            ? [
                `[toolCallId: ${toolCallId}] [artifactType: ${artifactType || 'unknown'}] Some propSelectors failed: ${allFailedSelectors.join(', ')}. Used fallback direct property access where possible.`,
              ]
            : [];

        // Prepare artifact data for later processing (not saving immediately)
        const artifactDataItems = dataItems.map((_item, index) => ({
          artifactId: nanoid(),
          summaryData: summaryData[index] || {},
          fullData: fullData[index] || {},
          metadata: {
            toolName: toolResult.toolName,
            toolCallId: toolResult.toolCallId,
            baseSelector,
            propSelectors,
            artifactType,
            sessionId: sessionId,
            itemIndex: index,
            totalItems: dataItems.length,
          },
        }));

        const session = toolSessionManager.getSession(sessionId);
        const taskId = session?.taskId;

        // Record artifact preparation events in GraphSession for out-of-band processing
        // The actual saving will happen after name/description generation
        if (streamRequestId && agentId && session) {
          artifactDataItems.forEach((artifactData, _index) => {
            // Record event that will trigger name/description generation
            graphSessionManager.recordEvent(streamRequestId, 'artifact_saved', agentId, {
              artifactId: artifactData.artifactId,
              taskId: taskId || 'unknown',
              artifactType: artifactType || 'unknown',
              summaryProps: artifactData.summaryData,
              fullProps: artifactData.fullData,
              metadata: artifactData.metadata,
              // Session info needed for saving to ledger
              tenantId: session.tenantId,
              projectId: session.projectId,
              contextId: session.contextId,
              // Mark as pending - needs name/description generation
              pendingGeneration: true,
            });
          });
        }

        // Build artifacts object with only the essential data
        const artifacts = artifactDataItems.reduce(
          (acc, artifactData, _index) => {
            acc[`${artifactData.artifactId}:${taskId}`] = {
              artifactId: artifactData.artifactId,
              artifactType,
              taskId: taskId,
              summaryData: artifactData.summaryData,
            };
            return acc;
          },
          {} as Record<string, any>
        );

        return {
          saved: true,
          artifacts: Object.values(artifacts).map((a) => ({
            artifactId: a.artifactId,
            taskId: a.taskId,
            summaryData: a.summaryData,
          })),
          warnings,
        };
      } catch (error) {
        logger.error({ error, toolCallId, sessionId }, 'Error processing save_tool_result');
        return {
          saved: false,
          error: `[toolCallId: ${toolCallId}] ${error instanceof Error ? error.message : 'Unknown error'}`,
          warnings: [],
        };
      }
    },
  });
}
