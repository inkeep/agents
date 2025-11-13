import { preview } from '@inkeep/agents-core';
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const strategicOutline = artifactComponent({
  id: 'strategic_outline',
  name: 'strategic_outline',
  description: 'Strategic outline with Smart Brevity structure and evidence mapping',
  props: z.object({
    title: preview(z.string().describe('SEO-optimized blog title')),
    metaDescription: preview(z.string().describe('Meta description for SEO')),
    path: preview(
      z
        .enum(['how-to', 'data-analysis', 'case-study', 'opinion', 'product-launch', 'trend-brief'])
        .describe('Smart Brevity path chosen')
    ),
    targetWordCount: preview(z.number().describe('Target word count for the article')),
    primaryKeyword: preview(z.string().describe('Primary SEO keyword')),
    outline: z.string().describe('Complete Smart Brevity outline with all sections'),
    evidenceMap: z
      .array(
        z.object({
          claim: z.string().describe('The claim or statement being made'),
          citationIds: z
            .array(z.string())
            .describe('Array of citation artifact IDs supporting this claim'),
          section: z.string().describe('Which section of the outline this claim belongs to'),
        })
      )
      .describe('Map linking claims to citation artifacts'),
    keyQuotes: z
      .array(
        z.object({
          quote: z.string(),
          citationId: z.string().describe('Citation artifact ID for this quote'),
        })
      )
      .describe('Key quotes extracted with citation references'),
    createdAt: preview(z.string().describe('ISO timestamp when outline was created')),
  }),
});
