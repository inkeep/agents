import { parseEmbeddedJson } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { unwrapToolResult } from '../../artifacts/artifact-utils';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('Agent');

export function getToolResultConversationId(ctx: AgentRunContext): string | undefined {
  return ctx.conversationId;
}

const CHAINING_GUIDANCE = {
  howToChain:
    '🔧 To pass this result as input to another tool, use { "$tool": "<_toolCallId value>" } as the argument — the system resolves the full data automatically.',
  neverCopy:
    '❌ NEVER copy, retype, paraphrase, or reconstruct result data manually — not as a tool argument, not inline in a response. Always use { "$tool": "..." } references.',
  toolCallIdRule:
    '🔧 CRITICAL: NEVER generate or make up a tool call ID. The _toolCallId field in this result is the exact ID to use in { "$tool": "..." } references.',
};

const ARTIFACT_GUIDANCE = {
  toolCallId:
    '🔧 CRITICAL: Use the _toolCallId field from this result object as the exact tool call ID in your artifact:create tag. NEVER generate or make up a tool call ID.',
  artifactChaining:
    '🔗 To pass a saved artifact as input to a tool, use { "$artifact": "<artifactId>", "$tool": "<toolCallId>" } as the argument — do NOT call get_reference_artifact first. The system resolves the full artifact data automatically.',
  creationFirst:
    '🚨 CRITICAL: Artifacts must be CREATED before they can be referenced. Use ArtifactCreate_[Type] components FIRST, then reference with Artifact components only if citing the SAME artifact again.',
  baseSelector:
    "🎯 CRITICAL: Use base_selector to navigate to ONE specific item. For deeply nested structures with repeated keys, use full paths with specific filtering (e.g., \"data.content.items[?type=='guide' && status=='active']\")",
  detailsSelector:
    '📝 Use relative selectors for specific fields (e.g., "title", "metadata.category", "properties.status", "content.details")',
  avoidLiterals: '❌ NEVER use literal values - always use field selectors to extract from data',
  avoidArrays:
    '✨ ALWAYS filter arrays to single items using [?condition] - NEVER use [*] notation which returns arrays',
  nestedKeys:
    '🔑 For structures with repeated keys (like content.data.content.items.content), use full paths with filtering at each level',
  filterTips: "💡 Use compound filters for precision: [?type=='document' && category=='api']",
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
};

export function enhanceToolResultWithStructureHints(
  ctx: AgentRunContext,
  result: any,
  toolCallId?: string
): any {
  if (result === undefined) {
    return result;
  }

  const hasArtifacts = !!(ctx.artifactComponents && ctx.artifactComponents.length > 0);

  if (typeof result !== 'object' || result === null) {
    const wrapped = toolCallId
      ? { [typeof result === 'string' ? 'text' : 'value']: result, _toolCallId: toolCallId }
      : result;
    if (!toolCallId) return wrapped;
    return {
      ...wrapped,
      _structureHints: {
        commonFields: [],
        exampleSelectors: [],
        chainingGuidance: CHAINING_GUIDANCE,
        ...(hasArtifacts ? { artifactGuidance: ARTIFACT_GUIDANCE } : {}),
        note: `Plain ${typeof result} result.`,
      },
    };
  }

  const unwrapped = unwrapToolResult(result);

  let parsedForAnalysis = unwrapped;
  if (typeof unwrapped === 'string') {
    try {
      parsedForAnalysis = parseEmbeddedJson(unwrapped);
    } catch (_error) {
      parsedForAnalysis = unwrapped;
    }
  }

  if (!parsedForAnalysis || typeof parsedForAnalysis !== 'object') {
    return {
      ...result,
      ...(toolCallId ? { _toolCallId: toolCallId } : {}),
      _structureHints: {
        commonFields: [],
        exampleSelectors: [],
        chainingGuidance: CHAINING_GUIDANCE,
        ...(hasArtifacts ? { artifactGuidance: ARTIFACT_GUIDANCE } : {}),
        note: `Plain ${typeof parsedForAnalysis} result — no nested structure to navigate.`,
      },
    };
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
        const isDataItem = firstItem.title || firstItem.url || firstItem.record_type;
        if (isDataItem) {
          if (firstItem.type) {
            selectors.push(`${prefix}[?type=='${firstItem.type}'] | [0]`);
          }
          if (firstItem.record_type) {
            selectors.push(`${prefix}[?record_type=='${firstItem.record_type}'] | [0]`);
          }
          if (firstItem.url) {
            selectors.push(`${prefix}[?url!=null] | [0]`);
          }
          obj.slice(0, 20).forEach((item: any) => {
            if (item && typeof item === 'object' && item.title) {
              const escapedTitle = String(item.title).replace(/'/g, "\\'");
              if (item.type) {
                selectors.push(
                  `${prefix}[?type=='${item.type}' && title=='${escapedTitle}'] | [0]`
                );
              } else {
                selectors.push(`${prefix}[?title=='${escapedTitle}'] | [0]`);
              }
            }
          });
        }
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
            const isDataItem = firstItem.title || firstItem.url || firstItem.record_type;
            if (isDataItem && (firstItem.type === 'document' || firstItem.type === 'text')) {
              if (firstItem.record_type) {
                paths.push(`${currentPath}[?record_type=='${firstItem.record_type}'] | [0]`);
              }
              value.slice(0, 20).forEach((item: any) => {
                if (item && typeof item === 'object' && item.title) {
                  const escapedTitle = String(item.title).replace(/'/g, "\\'");
                  paths.push(
                    `${currentPath}[?type=='${item.type}' && title=='${escapedTitle}'] | [0]`
                  );
                }
              });
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

    const uniqueSelectors = [...new Set([...usefulSelectors, ...nestedContentPaths])].slice(0, 15);
    const maxDepth = Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length));

    return {
      ...result,
      ...(toolCallId ? { _toolCallId: toolCallId } : {}),
      _structureHints: {
        commonFields,
        exampleSelectors: uniqueSelectors,
        maxDepthFound: maxDepth,
        totalPathsFound: allPaths.length,
        chainingGuidance: CHAINING_GUIDANCE,
        ...(hasArtifacts
          ? {
              artifactGuidance: {
                ...ARTIFACT_GUIDANCE,
                pathDepth: `📏 This structure goes ${maxDepth} levels deep - use full paths to avoid ambiguity`,
              },
            }
          : {}),
        note: `Structure analysis: ${allPaths.length} paths found, ${maxDepth} levels deep.`,
      },
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to enhance tool result with structure hints');
    return result;
  }
}
