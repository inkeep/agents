import { z } from 'zod';

const answerConfidence = z
  .union([
    z.literal('very_confident').describe(`
    The AI Assistant provided a complete and direct answer to all parts of the User Question.
    The answer fully resolved the issue without requiring any further action from the User.
    Every part of the answer was cited from the information sources.
    The assistant did not ask for more information or provide options requiring User action.
    This is the highest Answer Confidence level and should be used sparingly.
  `),
    z.literal('somewhat_confident').describe(`
    The AI Assistant provided a complete and direct answer to the User Question, but the answer contained minor caveats or uncertainties. 
 
    Examples:
    • The AI Assistant asked follow-up questions to the User
    • The AI Assistant requested additional information from the User
    • The AI Assistant suggested uncertainty in the answer
    • The AI Assistant answered the question but mentioned potential exceptions
  `),
    z.literal('not_confident').describe(`
    The AI Assistant tried to answer the User Question but did not fully resolve it.
    The assistant provided options requiring further action from the User, asked for more information, showed uncertainty,
    suggested the user contact support or provided contact information, or provided an indirect or incomplete answer.
    This is the most common Answer Confidence level.
 
    Examples:
    • The AI Assistant provided a general answer not directly related to the User Question
    • The AI Assistant said to reach out to support or provided an email address or contact information
    • The AI Assistant provided options that require further action from the User to resolve the issue
  `),
    z.literal('no_sources').describe(`
    The AI Assistant did not use or cite any sources from the information sources to answer the User Question.
  `),
    z.literal('other').describe(`
    The User Question is unclear or unrelated to the subject matter.
  `),
  ])
  .describe(
    'A measure of how confidently the AI Assistant completely and directly answered the User Question.'
  );

export const provideAnswerConfidenceSchema = z.object({
  explanation: z
    .string()
    .describe('A brief few word justification of why a specific confidence level was chosen.'),
  answerConfidence,
});
