import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const citation = artifactComponent({
  id: 'citation',
  name: 'citation',
  description: 'A citation component for displaying source document references',
  props: z.object({
    url: z.string().describe('URL of the source document'),
    title: z.string().describe('Title of the source document'),
    content: z.array(z.object({
      text: z.string().describe('The actual text content'),
      type: z.string().describe('Type of content (text, image, video, etc.)')
    })).optional().describe('Array of content items from the source'),
    record_type: z.string().describe('Type of record (documentation, blog, guide, etc.)')
  })
});