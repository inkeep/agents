import { preview } from '@inkeep/agents-core';
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const citation = artifactComponent({
  id: 'citation',
  name: 'citation',
  description: 'Structured factual information extracted from search results',
  props: z.object({
    url: preview(z.string().describe('URL of the source document')),
    title: preview(z.string().describe('Title of the source document')),
    content: z
      .array(
        z
          .strictObject({
            text: z.string().describe('The actual text content'),
            type: z.string().describe('Type of content (text, image, video, etc.)'),
          })
          .describe('A structured content block extracted from the source document')
      )
      .describe('Array of structured content blocks extracted from the document'),
    record_type: preview(z.string().describe('Type of record (documentation, blog, guide, etc.)')),
  }),
});
