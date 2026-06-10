import { parseEmbeddedJson } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('Agent');

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

  const findAllPaths = (obj: any, prefix = 'result', depth = 0): string[] => {
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
        const currentPath = `${prefix}.${key}`;

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

  const findUsefulSelectors = (obj: any, prefix = 'result', depth = 0): string[] => {
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
          selectors.push(...findUsefulSelectors(value, `${prefix}.${key}`, depth + 1));
        }
      });
    }

    return selectors;
  };

  const findNestedContentPaths = (obj: any, prefix = 'result', depth = 0): string[] => {
    if (depth > 6) return [];

    const paths: string[] = [];

    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = `${prefix}.${key}`;

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

    // Leaf (scalar) paths carry a [type] suffix, e.g. "result.content.text[string]".
    const leafPaths = allPaths.filter(
      (p) => p.includes('[string]') || p.includes('[number]') || p.includes('[boolean]')
    );

    // A field NAME that resolves to more than one distinct full path is ambiguous: writing the bare
    // name or guessing the nesting silently picks the wrong one (the classic "content" under both
    // the root and result.content.text.content). List every full path so the model copies the exact
    // one instead of reconstructing it from the path-less, de-duplicated commonFields list.
    const stripLeafType = (p: string) => p.replace(/\[(?:string|number|boolean)\]$/, '');
    const fieldNameToPaths = new Map<string, Set<string>>();
    for (const leaf of leafPaths) {
      const fullPath = stripLeafType(leaf);
      const name = fullPath.split('.').pop() ?? '';
      if (!name) continue;
      if (!fieldNameToPaths.has(name)) fieldNameToPaths.set(name, new Set());
      fieldNameToPaths.get(name)?.add(fullPath);
    }
    const ambiguousFields: Record<string, string[]> = {};
    for (const [name, paths] of fieldNameToPaths) {
      if (paths.size > 1) {
        ambiguousFields[name] = Array.from(paths).slice(0, 8);
      }
    }

    // Prioritize the disambiguating leaf paths so they survive truncation — a terminalPaths list
    // that drops the one repeated-name path the model needs is the whole failure mode.
    const ambiguousPathSet = new Set(Object.values(ambiguousFields).flat());
    const isAmbiguousLeaf = (p: string) => ambiguousPathSet.has(stripLeafType(p));
    const terminalPaths = [
      ...leafPaths.filter(isAmbiguousLeaf),
      ...leafPaths.filter((p) => !isAmbiguousLeaf(p)),
    ].slice(0, 30);
    const arrayPaths = allPaths.filter((p) => p.includes('[array')).slice(0, 15);
    const objectPaths = allPaths.filter((p) => p.includes('[object]')).slice(0, 15);

    const allSelectors = [...usefulSelectors, ...nestedContentPaths];
    const uniqueSelectors = [...new Set(allSelectors)].slice(0, 15);

    // A short, copy-ready list of single-item base selectors, cleanest path first. The model tends
    // to invent a path segment (observed: writing `content[0].text.documents` for a `.content`
    // array) when it has to assemble a deep path itself. MCP results expose a flat `structuredContent`
    // array alongside the nested `content[0].text...` envelope, so rank structuredContent-rooted and
    // document-typed selectors to the front; the model copies the top one instead of guessing.
    // A single-item selector is the pipe form (`...[?f] | [0]`) or a plain trailing index on a
    // non-filtered array (`...content[0]`). Exclude the bare filter-then-index form `...[?f][0]`,
    // which projects the index over each match and resolves to [] at runtime (the form this PR
    // teaches against), so a future selector generator can never feed it in as "ready-to-use".
    const isSingleItem = (s: string) =>
      s.includes('| [0]') || (/\[0\]$/.test(s) && !/\[\?[^\]]*\]\[0\]/.test(s));
    const baseSelectorRank = (s: string) => {
      let score = 0;
      if (s.includes('structuredContent')) score -= 10;
      if (s.includes("type=='document'")) score -= 5;
      if (s.includes('title') || s.includes('record_type')) score -= 2;
      return score;
    };
    const recommendedBaseSelectors = uniqueSelectors
      .filter(isSingleItem)
      .sort((a, b) => baseSelectorRank(a) - baseSelectorRank(b))
      .slice(0, 6);

    const enhanced = {
      ...result,
      ...(toolCallId ? { _toolCallId: toolCallId } : {}),
      _structureHints: {
        terminalPaths: terminalPaths,
        arrayPaths: arrayPaths,
        objectPaths: objectPaths,
        commonFields: commonFields,
        ambiguousFields: ambiguousFields,
        recommendedBaseSelectors: recommendedBaseSelectors,
        exampleSelectors: uniqueSelectors,
        deepStructureExamples: nestedContentPaths,
        maxDepthFound: Math.max(...allPaths.map((p) => (p.match(/\./g) || []).length)),
        totalPathsFound: allPaths.length,
        toolChainingGuidance: {
          how: `🔗 To chain this data into parameter "<paramName>" of another tool: set "<paramName>": null and add "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.TOOL}": "${toolCallId}", "${SENTINEL_KEY.SELECT}": "<JMESPath>" } }. Never copy tool output inline — always tool-chain.`,
          fullPassthrough: `To pass ALL data: set "<paramName>": null + "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.TOOL}": "${toolCallId}" } }`,
          filteredPassthrough: `To pass a SUBSET: set "<paramName>": null + "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.TOOL}": "${toolCallId}", "${SENTINEL_KEY.SELECT}": "<path from exampleSelectors>" } }`,
          selectors: `exampleSelectors above are ready-to-use ${SENTINEL_KEY.SELECT} paths — pick one and use it directly. The "result." prefix is auto-stripped. terminalPaths show every leaf field with its type (string, number, boolean).`,
          primitives: `If the next tool expects a string/number, use ${SENTINEL_KEY.SELECT} to pick the leaf field from terminalPaths. Example: "<paramName>": null, "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.TOOL}": "${toolCallId}", "${SENTINEL_KEY.SELECT}": "data.items[0].content.text" } }`,
          sequencing:
            'Tool chaining requires SEQUENTIAL calls. You must wait for this result before calling the next tool. Never batch dependent tools in the same turn.',
          forbidden: `❌ Never copy tool output inline — always tool-chain via "${SENTINEL_KEY.REFS}". ❌ Do not use get_reference_artifact to pass data to another tool — tool-chain instead.`,
        },
        artifactGuidance: {
          toolCallId:
            '🔧 CRITICAL: Use the _toolCallId field from this result object. This is the exact tool call ID you must use in your artifact:create tag. NEVER generate or make up a tool call ID.',
          creationFirst:
            '🚨 CRITICAL: Artifacts must be CREATED before they can be referenced. Use ArtifactCreate_[Type] components FIRST, then reference with Artifact components only if citing the SAME artifact again.',
          baseSelector:
            "🎯 CRITICAL: Use base_selector to navigate to ONE specific item. For deeply nested structures with repeated keys, use full paths with specific filtering (e.g., \"result.data.content.items[?type=='guide' && status=='active']\")",
          detailsSelector:
            '📝 Use relative selectors for specific fields (e.g., "title", "metadata.category", "properties.status", "content.details")',
          avoidLiterals:
            '❌ NEVER use literal values - always use field selectors to extract from data',
          avoidArrays:
            '✨ ALWAYS filter arrays to single items using [?condition] - NEVER use [*] notation which returns arrays',
          nestedKeys:
            '🔑 When a field name repeats at multiple depths (like result.content.data.content), check _structureHints.ambiguousFields — it lists EVERY full path for that name. Copy the exact full path you want; never write the bare name or guess the nesting from commonFields.',
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
            "❌ NEVER: result.items[?type=='doc'][?status=='active'] (chained filters)\n" +
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
