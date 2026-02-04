/**
 * JSON Schema templates
 * Used for evaluators, structured outputs, and other schema-based inputs
 */

/**
 * Basic JSON schema template for general use
 */
export const basicSchemaTemplate = JSON.stringify(
  {
    type: 'object',
    properties: {
      example_property: {
        type: 'string',
        description: 'Description of what this property represents',
      },
    },
    required: ['example_property'],
  },
  null,
  2
);

/**
 * Evaluator output schema template
 */
export const evaluatorSchemaTemplate = JSON.stringify(
  {
    type: 'object',
    properties: {
      score: {
        type: 'number',
        description: 'Numeric score from 1-5 indicating quality',
      },
      passed: {
        type: 'boolean',
        description: 'Whether the conversation met the evaluation criteria',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation of the evaluation result',
      },
    },
    required: ['score', 'passed', 'reasoning'],
  },
  null,
  2
);

export const customHeadersTemplate = JSON.stringify({
  tz: 'US/Pacific',
});
