#!/usr/bin/env tsx
/**
 * Script to create evaluators for the Inkeep Facts Agent
 * 
 * This script creates evaluators that assess:
 * - Citation Quality: Proper use of artifact citations
 * - Accuracy: Correctness of information provided
 * - Completeness: Whether questions are fully answered
 * - Clarity: How clear and understandable responses are
 * - Factual Correctness: Absence of hallucinations
 * 
 * Usage:
 *   tsx create-evaluators.ts <tenantId> <projectId> <evalApiUrl> [apiKey]
 */

import { createEvaluator } from '@inkeep/agents-sdk';

const EVAL_API_URL = process.env.EVAL_API_URL || 'http://localhost:3005';
const API_KEY = process.env.API_KEY;

interface EvaluatorDefinition {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schema: Record<string, unknown>;
  model: {
    model: string;
    providerOptions?: Record<string, unknown>;
  };
}

const evaluators: EvaluatorDefinition[] = [
  {
    id: 'citation-quality-evaluator',
    name: 'Citation Quality Evaluator',
    description:
      'Evaluates whether the agent properly cites sources using artifact citations. Checks for proper citation format, completeness of citations, and whether all factual claims are backed by citations.',
    prompt: `You are evaluating an AI assistant's response for citation quality. The assistant should cite sources using artifact references when providing factual information.

Key criteria to evaluate:
1. **Citation Presence**: Does the response cite sources for factual claims using artifact references?
2. **Citation Completeness**: Are all factual claims backed by citations, or are there unsupported statements?
3. **Citation Format**: Are citations properly formatted as artifact references (not just URLs or titles)?
4. **Citation Relevance**: Are the cited sources actually relevant to the claims being made?
5. **No Unsupported Claims**: Are there any factual claims made without citations?

The agent's instructions emphasize:
- "MUST save relevant information as artifacts using save_tool_result BEFORE citing them"
- "Always cite using saved artifacts when referencing information sources"
- "For every claim that comes **directly from** an information source, attach artifact citations in-line"
- "Skip citations for statements that do **not** rely on an information source"

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        citationScore: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Overall citation quality score (0-10). Higher scores indicate proper citation usage.',
        },
        citationPresence: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for presence of citations (0-10). Are citations present where needed?',
        },
        citationCompleteness: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for completeness of citations (0-10). Are all factual claims cited?',
        },
        citationFormat: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for citation format (0-10). Are citations properly formatted as artifact references?',
        },
        unsupportedClaims: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of factual claims made without proper citations',
        },
        missingCitations: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of statements that should have citations but do not',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of the citation quality',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Areas where citation quality could be improved',
        },
        overallAssessment: {
          type: 'string',
          description: 'Overall assessment of citation quality',
        },
      },
      required: [
        'citationScore',
        'citationPresence',
        'citationCompleteness',
        'citationFormat',
        'unsupportedClaims',
        'missingCitations',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  {
    id: 'accuracy-evaluator',
    name: 'Accuracy Evaluator',
    description:
      'Evaluates the accuracy of information provided by the agent. Checks if the information is correct, up-to-date, and aligned with the documentation sources.',
    prompt: `You are evaluating an AI assistant's response for accuracy. The assistant should provide accurate, factual information based on documentation sources.

Key criteria to evaluate:
1. **Factual Correctness**: Is the information provided factually correct?
2. **Source Alignment**: Does the information align with what's stated in the documentation sources?
3. **Technical Accuracy**: Are technical details, code examples, and API usage correct?
4. **No Misinformation**: Are there any incorrect statements or misleading information?
5. **Precision**: Is the information precise and specific, or vague and general?

The agent's instructions emphasize:
- "You must always use information sources to answer the user's question, never make up information"
- "Only use knowledge_space to provide context for the user's question, NEVER use it to answer the user's question"
- "Quote exactly inside code blocks" for programming entities
- "Must be an exact quote from facts" for code snippets

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        accuracyScore: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Overall accuracy score (0-10). Higher scores indicate more accurate information.',
        },
        factualCorrectness: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for factual correctness (0-10). Is the information factually correct?',
        },
        sourceAlignment: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for alignment with sources (0-10). Does information match the documentation?',
        },
        technicalAccuracy: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for technical accuracy (0-10). Are technical details correct?',
        },
        inaccuracies: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of inaccurate statements or information',
        },
        correctInformation: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of accurate statements that demonstrate correctness',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of the accuracy',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Areas where accuracy could be improved',
        },
        overallAssessment: {
          type: 'string',
          description: 'Overall assessment of accuracy',
        },
      },
      required: [
        'accuracyScore',
        'factualCorrectness',
        'sourceAlignment',
        'technicalAccuracy',
        'inaccuracies',
        'correctInformation',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  {
    id: 'completeness-evaluator',
    name: 'Completeness Evaluator',
    description:
      "Evaluates whether the agent fully answers the user's question. Checks if all aspects of the question are addressed and if the response is comprehensive.",
    prompt: `You are evaluating an AI assistant's response for completeness. The assistant should fully answer the user's question without leaving important aspects unaddressed.

Key criteria to evaluate:
1. **Question Coverage**: Does the response address all parts of the user's question?
2. **Comprehensiveness**: Is the response thorough and complete, or does it leave gaps?
3. **Missing Information**: Are there aspects of the question that were not addressed?
4. **Depth**: Does the response go deep enough, or is it too superficial?
5. **Follow-up Needs**: Would the user need to ask follow-up questions to get complete information?

The agent's instructions emphasize:
- "A concise, to the point response to the user's question. No fluff. No apologies. No extra information. Just the answer."
- "Help developers use Inkeep, always citing sources"
- "Extract and provide the actual steps, code examples, or information from guides rather than referring users to them"

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        completenessScore: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Overall completeness score (0-10). Higher scores indicate more complete answers.',
        },
        questionCoverage: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for question coverage (0-10). Are all parts of the question addressed?',
        },
        comprehensiveness: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for comprehensiveness (0-10). Is the response thorough?',
        },
        depth: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for depth (0-10). Does the response go deep enough?',
        },
        missingAspects: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of aspects of the question that were not addressed',
        },
        addressedAspects: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of aspects of the question that were properly addressed',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of the completeness',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Areas where completeness could be improved',
        },
        overallAssessment: {
          type: 'string',
          description: 'Overall assessment of completeness',
        },
      },
      required: [
        'completenessScore',
        'questionCoverage',
        'comprehensiveness',
        'depth',
        'missingAspects',
        'addressedAspects',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  {
    id: 'clarity-evaluator',
    name: 'Clarity Evaluator',
    description:
      "Evaluates the clarity and understandability of the agent's responses. Checks if the language is clear, well-structured, and easy to follow.",
    prompt: `You are evaluating an AI assistant's response for clarity. The assistant should provide clear, understandable responses that are easy to follow.

Key criteria to evaluate:
1. **Language Clarity**: Is the language clear and easy to understand?
2. **Structure**: Is the response well-organized and structured?
3. **Conciseness**: Is the response concise without unnecessary fluff?
4. **Technical Communication**: Are technical concepts explained clearly?
5. **Readability**: Is the response easy to read and follow?

The agent's instructions emphasize:
- "A concise, to the point response to the user's question. No fluff. No apologies. No extra information. Just the answer."
- "Direct, neutral, no fluff" tone
- "Must be removed from the response" for fluff
- "Use the response_format to format your response"

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        clarityScore: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Overall clarity score (0-10). Higher scores indicate clearer responses.',
        },
        languageClarity: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for language clarity (0-10). Is the language clear?',
        },
        structure: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for structure (0-10). Is the response well-organized?',
        },
        conciseness: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for conciseness (0-10). Is the response concise?',
        },
        technicalCommunication: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Score for technical communication (0-10). Are technical concepts clear?',
        },
        unclearSections: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of sections that are unclear or confusing',
        },
        clearSections: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of sections that are particularly clear',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of the clarity',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Areas where clarity could be improved',
        },
        overallAssessment: {
          type: 'string',
          description: 'Overall assessment of clarity',
        },
      },
      required: [
        'clarityScore',
        'languageClarity',
        'structure',
        'conciseness',
        'technicalCommunication',
        'unclearSections',
        'clearSections',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  {
    id: 'factual-correctness-evaluator',
    name: 'Factual Correctness Evaluator',
    description:
      'Evaluates whether the agent avoids hallucinations and provides only factual information. Checks for made-up information, unsupported claims, and violations of factual correctness rules.',
    prompt: `You are evaluating an AI assistant's response for factual correctness and absence of hallucinations. The assistant should only provide factual information from sources and never make up information.

Key criteria to evaluate:
1. **Hallucination Detection**: Are there any fabricated facts, names, code, or information?
2. **Unsupported Claims**: Are there claims not backed by the documentation sources?
3. **Invented Entities**: Are there code constructs, methods, or entities that don't exist?
4. **Conflation**: Is information mixed across different technology variants incorrectly?
5. **Violation Detection**: Are there violations of the agent's rules (unsupported statements, conflation, hallucination, invented entities)?

The agent's instructions explicitly prohibit:
- **unsupported_statement**: "Claim not explicitly backed by a cited source"
- **conflation**: "Mixing information across technology variants"
- **hallucination**: "Fabricated names, code, or facts"
- **invented_entity**: "Never infer code or entities not in sources"

The agent's rules state:
- "You must always use information sources to answer the user's question, never make up information"
- "Never question, doubt, or verify information from these tools - it is authoritative"
- "Mention only if present in facts" for programming entities
- "Must be an exact quote from facts" for code snippets

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        factualCorrectnessScore: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'Overall factual correctness score (0-10). Higher scores indicate fewer hallucinations and more factual accuracy.',
        },
        hallucinationCount: {
          type: 'number',
          minimum: 0,
          description: 'Number of hallucinations detected',
        },
        unsupportedClaimsCount: {
          type: 'number',
          minimum: 0,
          description: 'Number of unsupported claims detected',
        },
        inventedEntitiesCount: {
          type: 'number',
          minimum: 0,
          description: 'Number of invented entities detected',
        },
        conflationCount: {
          type: 'number',
          minimum: 0,
          description: 'Number of conflation issues detected',
        },
        hallucinations: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of specific hallucinations detected',
        },
        unsupportedClaims: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of unsupported claims detected',
        },
        inventedEntities: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of invented entities detected',
        },
        conflations: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of conflation issues detected',
        },
        factualStatements: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of statements that are factually correct and properly sourced',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of factual correctness',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Areas where factual correctness could be improved',
        },
        overallAssessment: {
          type: 'string',
          description: 'Overall assessment of factual correctness',
        },
      },
      required: [
        'factualCorrectnessScore',
        'hallucinationCount',
        'unsupportedClaimsCount',
        'inventedEntitiesCount',
        'conflationCount',
        'hallucinations',
        'unsupportedClaims',
        'inventedEntities',
        'conflations',
        'factualStatements',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  {
    id: 'expected-output-similarity-evaluator',
    name: 'Expected Output Similarity Evaluator',
    description:
      "Evaluates how similar the agent's response is to the expected output from the dataset item. Returns N/A if no expected output is provided.",
    prompt: `You are evaluating an AI assistant's response by comparing it to the expected output from the dataset item.

Key criteria to evaluate:
1. **Expected Output Availability**: Is there an expected output provided for this dataset item?
2. **Semantic Similarity**: If expected output exists, how semantically similar is the actual response to the expected output?
3. **Key Information Match**: Do the key pieces of information in the expected output appear in the actual response?
4. **Completeness Match**: Does the actual response cover the same topics/points as the expected output?
5. **Tone and Style**: Are the tone and style similar between expected and actual outputs?

**IMPORTANT**: 
- If NO expected output is provided or found in the conversation context, trace, or agent definition, you MUST set "hasExpectedOutput" to false and "similarityScore" to null (or "N/A" as a string).
- Only compare similarity if expected output is available.
- Look for expected output in:
  - The conversation history (may be mentioned as "expected output" or "expected response")
  - The execution trace (may contain dataset item information)
  - The agent definition (may reference expected outputs)

Evaluate the conversation and provide your assessment.`,
    schema: {
      type: 'object',
      properties: {
        hasExpectedOutput: {
          type: 'boolean',
          description:
            'Whether an expected output was found for this dataset item. If false, similarity scores should be null/N/A.',
        },
        similarityScore: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 10 },
            { type: 'string', enum: ['N/A'] },
          ],
          description:
            'Overall similarity score (0-10) if expected output exists, or "N/A" if no expected output is available. Higher scores indicate greater similarity.',
        },
        semanticSimilarity: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 10 },
            { type: 'string', enum: ['N/A'] },
          ],
          description:
            'Score for semantic similarity (0-10) if expected output exists, or "N/A" if not available. Measures how similar the meaning is.',
        },
        keyInformationMatch: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 10 },
            { type: 'string', enum: ['N/A'] },
          ],
          description:
            'Score for key information match (0-10) if expected output exists, or "N/A" if not available. Measures if key facts/info match.',
        },
        completenessMatch: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 10 },
            { type: 'string', enum: ['N/A'] },
          ],
          description:
            'Score for completeness match (0-10) if expected output exists, or "N/A" if not available. Measures if all topics are covered.',
        },
        toneStyleMatch: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 10 },
            { type: 'string', enum: ['N/A'] },
          ],
          description:
            'Score for tone and style match (0-10) if expected output exists, or "N/A" if not available.',
        },
        expectedOutputFound: {
          type: 'string',
          description:
            'The expected output that was found, or "Not found" if no expected output was available.',
        },
        differences: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'List of key differences between expected and actual output (only if expected output exists). Empty array if no expected output.',
        },
        similarities: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'List of key similarities between expected and actual output (only if expected output exists). Empty array if no expected output.',
        },
        strengths: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Positive aspects of the match (or reasons why N/A if no expected output)',
        },
        weaknesses: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Areas where the match could be improved (or empty if no expected output)',
        },
        overallAssessment: {
          type: 'string',
          description:
            'Overall assessment of similarity, or explanation of why evaluation is N/A',
        },
      },
      required: [
        'hasExpectedOutput',
        'similarityScore',
        'semanticSimilarity',
        'keyInformationMatch',
        'completenessMatch',
        'toneStyleMatch',
        'expectedOutputFound',
        'differences',
        'similarities',
        'strengths',
        'weaknesses',
        'overallAssessment',
      ],
    },
    model: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
];

async function createEvaluatorsForProject(
  tenantId: string,
  projectId: string,
  evalApiUrl: string,
  apiKey?: string
): Promise<void> {
  console.log(`Creating evaluators for tenant: ${tenantId}, project: ${projectId}`);
  console.log(`Using evaluation API: ${evalApiUrl}\n`);

  // Test API connectivity first
  try {
    const testUrl = `${evalApiUrl}/tenants/${tenantId}/projects/${projectId}/evaluations/evaluators`;
    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    if (testResponse.status === 404) {
      console.error(
        `❌ Error: Project "${projectId}" not found or evaluation API not accessible.\n`
      );
      console.error('Possible issues:');
      console.error('  1. The project does not exist. Create it first using the agents-manage-api.');
      console.error('  2. The evaluation API is not running on the specified URL.');
      console.error('  3. The tenant ID or project ID is incorrect.\n');
      console.error(`   Test URL: ${testUrl}`);
      console.error(`   Response status: ${testResponse.status}\n`);
      return;
    }

    if (!testResponse.ok && testResponse.status !== 200) {
      console.warn(
        `⚠️  Warning: API returned status ${testResponse.status}. Continuing anyway...\n`
      );
    }
  } catch (error) {
    console.error(`❌ Error: Cannot connect to evaluation API at ${evalApiUrl}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error('Please ensure:');
    console.error('  1. The evaluation API is running');
    console.error('  2. The URL is correct (default: http://localhost:3005)');
    console.error('  3. The API is accessible from this machine\n');
    return;
  }

  for (const evaluator of evaluators) {
    try {
      console.log(`Creating evaluator: ${evaluator.name} (${evaluator.id})...`);
      const result = await createEvaluator(
        tenantId,
        projectId,
        evalApiUrl,
        evaluator as unknown as Record<string, unknown>,
        apiKey
      );
      console.log(`✅ Successfully created evaluator: ${evaluator.name}`);
      console.log(`   ID: ${(result as any).id || evaluator.id}\n`);
    } catch (error) {
      console.error(`❌ Failed to create evaluator: ${evaluator.name}`);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`   Error: ${errorMessage}\n`);

      // Provide helpful error messages
      if (errorMessage.includes('404')) {
        console.error('   This usually means the project does not exist.');
        console.error('   Create the project first using the agents-manage-api.\n');
      }
    }
  }

  console.log('Finished creating evaluators.');
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: tsx create-evaluators.ts <tenantId> <projectId> [evalApiUrl] [apiKey]');
  console.error('');
  console.error('Arguments:');
  console.error('  tenantId    - The tenant ID');
  console.error('  projectId   - The project ID');
  console.error('  evalApiUrl  - (Optional) Evaluation API URL (default: http://localhost:3005)');
  console.error('  apiKey      - (Optional) API key for authentication');
  console.error('');
  console.error('Environment variables:');
  console.error('  EVAL_API_URL - Evaluation API URL (overrides argument)');
  console.error('  API_KEY       - API key for authentication (overrides argument)');
  process.exit(1);
}

const tenantId = args[0];
const projectId = args[1];
const evalApiUrl = args[2] || EVAL_API_URL;
const apiKey = args[3] || API_KEY;

createEvaluatorsForProject(tenantId, projectId, evalApiUrl, apiKey).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

