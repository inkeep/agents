import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const citation = artifactComponent({
  id: 'citation',
  name: 'citation',
  description: 'A citation component for displaying source references and claims with metadata',
  props: z.object({
    title: z.string().describe('Title of the source document or claim'),
    url: z.string().describe('URL or source identifier'),
    sourceType: z
      .enum(['webpage', 'statistic', 'quote', 'data', 'research'])
      .describe('Type of source material'),
    content: z.string().describe('Full source content or relevant excerpt'),
    relevance: z.string().describe('How this source relates to the claim or topic'),
    extractedAt: z.string().describe('ISO timestamp when source was extracted'),
  }),
});
