export const citationArtifact = {
  id: 'citation',
  name: 'citation',
  description: 'Structured factual information extracted from search results',
  summaryProps: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the source document' },
      url: { type: 'string', description: 'URL of the source document' },
      record_type: {
        type: 'string',
        description: 'Type of record (documentation, blog, guide, etc.)',
      },
    },
    required: ['title', 'url', 'record_type'],
  },
  fullProps: {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Type of content (text, image, video, etc.)' },
            text: { type: 'string', description: 'The actual text content' },
          },
          required: ['type', 'text'],
        },
        description: 'Array of structured content blocks extracted from the document',
      },
    },
    required: ['content'],
  },
};
