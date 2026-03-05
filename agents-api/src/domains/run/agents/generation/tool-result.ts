import { parseEmbeddedJson } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('Agent');

export function formatToolResult(
  toolName: string,
  args: any,
  result: any,
  toolCallId: string
): string {
  const input = args ? JSON.stringify(args, null, 2) : 'No input';

  if (isToolResultDenied(result)) {
    return [
      `## Tool: ${toolName}`,
      '',
      `### 🔧 TOOL_CALL_ID: ${toolCallId}`,
      '',
      `### Output`,
      result.reason,
    ].join('\n');
  }

  let parsedResult = result;
  if (typeof result === 'string') {
    try {
      parsedResult = JSON.parse(result);
    } catch (_e) {}
  }

  const cleanResult =
    parsedResult && typeof parsedResult === 'object' && !Array.isArray(parsedResult)
      ? {
          ...parsedResult,
          result:
            parsedResult.result &&
            typeof parsedResult.result === 'object' &&
            !Array.isArray(parsedResult.result)
              ? Object.fromEntries(
                  Object.entries(parsedResult.result).filter(([key]) => key !== '_structureHints')
                )
              : parsedResult.result,
        }
      : parsedResult;

  const output =
    typeof cleanResult === 'string' ? cleanResult : JSON.stringify(cleanResult, null, 2);

  return `## Tool: ${toolName}

### 🔧 TOOL_CALL_ID: ${toolCallId}

### Input
${input}

### Output
${output}`;
}

export function getToolResultConversationId(ctx: AgentRunContext): string | undefined {
  return ctx.conversationId;
}

export function enhanceToolResultWithStructureHints(
  ctx: AgentRunContext,
  result: any,
  toolCallId?: string
): any {
  if (result === undefined) {
    return result;
  }

  if (typeof result !== 'object' || result === null) {
    if (toolCallId) {
      return { [typeof result === 'string' ? 'text' : 'value']: result, _toolCallId: toolCallId };
    }
    return result;
  }

  if (!ctx.artifactComponents || ctx.artifactComponents.length === 0) {
    if (toolCallId && typeof result === 'object') {
      return { ...result, _toolCallId: toolCallId };
    }
    return result;
  }

  let parsedForAnalysis = result;
  if (typeof result === 'string') {
    try {
      parsedForAnalysis = parseEmbeddedJson(result);
    } catch (_error) {
      parsedForAnalysis = result;
    }
  }

  if (!parsedForAnalysis || typeof parsedForAnalysis !== 'object') {
    return result;
  }

  const findAllPaths = (obj: any, prefix = '', depth = 0): string[] => {
    if (depth > 8) return [];

    const paths: string[] = [];

    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        paths.push(`${prefix}[array-${obj.length}-items]`);

        if (obj[0] && typeof obj[0] === 'object') {
          const sampleItem = obj[0];
          Object.keys(sampleItem).forEach((key) => {
            const value = sampleItem[key];
            if (typeof value === 'string' && value.length < 50) {
              paths.push(`${prefix}[?${key}=='${value}']`);
            } else if (typeof value === 'boolean') {
              paths.push(`${prefix}[?${key}==${value}]`);
            } else if (key === 'id' || key === 'name' || key === 'type') {
              paths.push(`${prefix}[?${key}=='value']`);
            }
          });
        }

        paths.push(...findAllPaths(obj[0], `${prefix}[?field=='value']`, depth + 1));
      }
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            paths.push(`${currentPath}[array]`);
          } else {
            paths.push(`${currentPath}[object]`);
          }
          paths.push(...findAllPaths(value, currentPath, depth + 1));
        } else {
          paths.push(`${currentPath}[${typeof value}]`);
        }
      });
    }

    return paths;
  };

  const findCommonFields = (obj: any, depth = 0): Set<string> => {
    if (depth > 5) return new Set();

    const fields = new Set<string>();
    if (Array.isArray(obj)) {
      obj.slice(0, 3).forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((key) => {
            fields.add(key);
          });
        }
      });
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        fields.add(key);
      });
      Object.values(obj).forEach((value) => {
        findCommonFields(value, depth + 1).forEach((field) => {
          fields.add(field);
        });
      });
    }
    return fields;
  };

  const findUsefulSelectors = (obj: any, prefix = '', depth = 0): string[] => {
    if (depth > 5) return [];

    const selectors: string[] = [];

    if (Array.isArray(obj) && obj.length > 0) {
      const firstItem = obj[0];
      if (firstItem && typeof firstItem === 'object') {
        if (firstItem.title) {
          selectors.push(
            `${prefix}[?title=='${String(firstItem.title).replace(/'/g, "\\'")}'] | [0]`
          );
        }
        if (firstItem.type) {
          selectors.push(`${prefix}[?type=='${firstItem.type}'] | [0]`);
        }
        if (firstItem.record_type) {
          selectors.push(`${prefix}[?record_type=='${firstItem.record_type}'] | [0]`);
        }
        if (firstItem.url) {
          selectors.push(`${prefix}[?url!=null] | [0]`);
        }

        if (firstItem.type && firstItem.title) {
          selectors.push(
            `${prefix}[?type=='${firstItem.type}' && title=='${String(firstItem.title).replace(/'/g, "\\'")}'] | [0]`
          );
        }

        selectors.push(`${prefix}[0]`);
      }
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          selectors.push(
            ...findUsefulSelectors(value, prefix ? `${prefix}.${key}` : key, depth + 1)
          );
        }
      });
    }

    return selectors;
  };

  const findNestedContentPaths = (obj: any, prefix = '', depth = 0): string[] => {
    if (depth > 6) return [];

    const paths: string[] = [];

    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value) && value.length > 0) {
          const firstItem = value[0];
          if (firstItem && typeof firstItem === 'object') {
            if (firstItem.type === 'document' || firstItem.type === 'text') {
              paths.push(`${currentPath}[?type=='document'] | [0]`);
              paths.push(`${currentPath}[?type=='text'] | [0]`);

              if (firstItem.title) {
                const titleSample = String(firstItem.title).slice(0, 20);
                paths.push(
                  `${currentPath}[?title && contains(title, '${titleSample.split(' ')[0]}')] | [0]`
                );
              }
              if (firstItem.record_type) {
                paths.push(`${currentPath}[?record_type=='${firstItem.record_type}'] | [0]`);
              }
            }
          }

          paths.push(...findNestedContentPaths(value, currentPath, depth + 1));
        } else if (value && typeof value === 'object') {
          paths.push(...findNestedContentPaths(value, currentPath, depth + 1));
        }
      });
    }

    return paths;
  };

  try {
    const allPaths = findAllPaths(parsedForAnalysis);
    const commonFields = Array.from(findCommonFields(parsedForAnalysis)).slice(0, 15);
    const usefulSelectors = findUsefulSelectors(parsedForAnalysis).slice(0, 10);
    const nestedContentPaths = findNestedContentPaths(parsedForAnalysis).slice(0, 8);

    const terminalPaths = allPaths
      .filter((p) => p.includes('[string]') || p.includes('[number]') || p.includes('[boolean]'))
      .slice(0, 20);
    const arrayPaths = allPaths.filter((p) => p.includes('[array')).slice(0, 15);
    const objectPaths = allPaths.filter((p) => p.includes('[object]')).slice(0, 15);

    const allSelectors = [...usefulSelectors, ...nestedContentPaths];
    const uniqueSelectors = [...new Set(allSelectors)].slice(0, 15);

    const enhanced = {
      ...result,
      ...(toolCallId ? { _toolCallId: toolCallId } : {}),
      _structureHints: {
        terminalPaths: terminalPaths,
        arrayPaths: arrayPaths,
        objectPaths: objectPaths,
        commonFields: commonFields,
        exampleSelectors: uniqueSelectors,
        deepStructureExamples: nestedContentPaths,
        maxDepthFound: Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length)),
        totalPathsFound: allPaths.length,
        artifactGuidance: {
          toolCallId:
            '🔧 CRITICAL: Use the _toolCallId field from this result object. This is the exact tool call ID you must use in your artifact:create tag. NEVER generate or make up a tool call ID.',
          creationFirst:
            '🚨 CRITICAL: Artifacts must be CREATED before they can be referenced. Use ArtifactCreate_[Type] components FIRST, then reference with Artifact components only if citing the SAME artifact again.',
          baseSelector:
            "🎯 CRITICAL: Use base_selector to navigate to ONE specific item. For deeply nested structures with repeated keys, use full paths with specific filtering (e.g., \"data.content.items[?type=='guide' && status=='active']\")",
          detailsSelector:
            '📝 Use relative selectors for specific fields (e.g., "title", "metadata.category", "properties.status", "content.details")',
          avoidLiterals:
            '❌ NEVER use literal values - always use field selectors to extract from data',
          avoidArrays:
            '✨ ALWAYS filter arrays to single items using [?condition] - NEVER use [*] notation which returns arrays',
          nestedKeys:
            '🔑 For structures with repeated keys (like content.data.content.items.content), use full paths with filtering at each level',
          filterTips:
            "💡 Use compound filters for precision: [?type=='document' && category=='api']",
          forbiddenSyntax:
            '🚫 FORBIDDEN JMESPATH PATTERNS:\n' +
            "❌ NEVER: [?title~'.*text.*'] (regex patterns with ~ operator)\n" +
            "❌ NEVER: [?field~'pattern.*'] (any ~ operator usage)\n" +
            "❌ NEVER: [?title~'Slack.*Discord.*'] (regex wildcards)\n" +
            "❌ NEVER: [?name~'https://.*'] (regex in URL matching)\n" +
            "❌ NEVER: [?text ~ contains(@, 'word')] (~ with @ operator)\n" +
            "❌ NEVER: contains(@, 'text') (@ operator usage)\n" +
            '❌ NEVER: [?field=="value"] (double quotes in filters)\n' +
            "❌ NEVER: items[?type=='doc'][?status=='active'] (chained filters)\n" +
            '✅ USE INSTEAD:\n' +
            "✅ [?contains(title, 'text')] (contains function)\n" +
            "✅ [?title=='exact match'] (exact string matching)\n" +
            "✅ [?contains(title, 'Slack') && contains(title, 'Discord')] (compound conditions)\n" +
            "✅ [?starts_with(url, 'https://')] (starts_with function)\n" +
            "✅ [?type=='doc' && status=='active'] (single filter with &&)",
          pathDepth: `📏 This structure goes ${Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length))} levels deep - use full paths to avoid ambiguity`,
        },
        note: `Comprehensive structure analysis: ${allPaths.length} paths found, ${Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length))} levels deep. Use specific filtering for precise selection.`,
      },
    };

    return enhanced;
  } catch (error) {
    logger.warn({ error }, 'Failed to enhance tool result with structure hints');
    return result;
  }
}
