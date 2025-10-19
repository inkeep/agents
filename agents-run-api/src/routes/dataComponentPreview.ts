import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  getDataComponent,
  getProject,
} from '@inkeep/agents-core';
import { streamObject } from 'ai';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { ModelFactory } from '../agents/ModelFactory';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('dataComponentPreview');

const app = new OpenAPIHono();

const generatePreviewRoute = createRoute({
  method: 'post',
  path: '/:tenantId/projects/:projectId/data-components/:id/generate-preview',
  tags: ['Data Component Preview'],
  summary: 'Generate Component Preview',
  description:
    'Generate a React/Tailwind component preview using AI based on the data component schema',
  request: {
    params: z.object({
      tenantId: z.string(),
      projectId: z.string(),
      id: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            instructions: z
              .string()
              .optional()
              .describe('Custom instructions for modifying the component'),
            existingCode: z.string().optional().describe('Existing component code to modify'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Streaming component code generation',
      headers: z.object({
        'Content-Type': z.string().default('text/plain; charset=utf-8'),
        'Cache-Control': z.string().default('no-cache'),
        Connection: z.string().default('keep-alive'),
      }),
      content: {
        'text/plain': {
          schema: z.string().describe('Streaming generated component code'),
        },
      },
    },
    ...commonGetErrorResponses,
  },
});

app.openapi(generatePreviewRoute, async (c): Promise<any> => {
  const { tenantId, projectId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const { instructions, existingCode } = body;

  logger.info(
    {
      tenantId,
      projectId,
      dataComponentId: id,
      hasInstructions: !!instructions,
      hasExistingCode: !!existingCode,
    },
    'Generating component preview'
  );

  const dataComponent = await getDataComponent(dbClient)({
    scopes: { tenantId, projectId },
    dataComponentId: id,
  });

  if (!dataComponent) {
    throw createApiError({
      code: 'not_found',
      message: 'Data component not found',
    });
  }

  const project = await getProject(dbClient)({
    scopes: { tenantId, projectId },
  });

  if (!project?.models?.base) {
    throw createApiError({
      code: 'bad_request',
      message: 'Project base model configuration is required',
    });
  }

  const prompt = buildGenerationPrompt(dataComponent, instructions, existingCode);

  try {
    const modelConfig = ModelFactory.prepareGenerationConfig(project.models.base);

    const previewSchema = z.object({
      code: z.string().describe('The React component code'),
      data: z.any().describe('Sample data matching the props schema'),
    });

    const result = streamObject({
      ...modelConfig,
      prompt,
      schema: previewSchema,
      temperature: 0.7,
    });

    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    // Get existing data if we're modifying
    const existingData =
      existingCode && dataComponent.preview?.data ? dataComponent.preview.data : null;

    return stream(c, async (stream) => {
      try {
        for await (const partialObject of result.partialObjectStream) {
          // If modifying with instructions, preserve existing data
          const outputObject =
            instructions && existingData ? { ...partialObject, data: existingData } : partialObject;

          await stream.write(JSON.stringify(outputObject) + '\n');
        }
      } catch (error) {
        logger.error(
          { error, tenantId, projectId, dataComponentId: id },
          'Error streaming preview generation'
        );
        await stream.write(
          JSON.stringify({ code: '// Error generating component preview', data: {} }) + '\n'
        );
      }
    }) as any;
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, dataComponentId: id },
      'Error generating component preview'
    );
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to generate component preview',
    });
  }
});

function buildGenerationPrompt(
  dataComponent: {
    name: string;
    description: string;
    props: Record<string, unknown> | null;
  },
  instructions?: string,
  existingCode?: string
): string {
  const propsSchema = dataComponent.props || {};
  const propsJson = JSON.stringify(propsSchema, null, 2);

  const componentName = sanitizeComponentName(dataComponent.name);

  // If we have custom instructions and existing code, modify the prompt
  if (instructions && existingCode) {
    return `You are an expert React and Tailwind CSS developer. You need to modify an existing React component based on specific instructions.

COMPONENT DETAILS:
- Original Name: ${dataComponent.name}
- Component Function Name: ${componentName}
- Description: ${dataComponent.description}
- Props Schema (JSON Schema): ${propsJson}

EXISTING COMPONENT CODE:
\`\`\`jsx
${existingCode}
\`\`\`

MODIFICATION INSTRUCTIONS:
${instructions}

REQUIREMENTS:
1. Modify the existing component code according to the instructions
2. Keep using Tailwind CSS SEMANTIC COLOR CLASSES (bg-background, text-foreground, etc.)
3. Maintain the balanced spacing and design principles from the original
4. Keep using lucide-react icons where appropriate
5. DO NOT include export statements - just the imports and function
6. DO NOT include TypeScript type annotations
7. Component name should remain: ${componentName}
8. DO NOT regenerate sample data - keep the same data structure

OUTPUT FORMAT:
You need to generate only one thing:
1. "code": The modified React component code as a string

Return ONLY the code field, the data field will be reused from the existing preview.

EXAMPLE OUTPUT:
{
  "code": "import { Mail, User } from 'lucide-react';\\n\\nfunction ${componentName}(props) {\\n  // Modified component code here\\n}"
}

Focus on making the requested changes while maintaining the component's quality and design principles.`;
  }

  return `You are an expert React and Tailwind CSS developer. Generate a beautiful, modern React component for displaying data and sample data to preview it.

COMPONENT DETAILS:
- Original Name: ${dataComponent.name}
- Component Function Name: ${componentName}
- Description: ${dataComponent.description}
- Props Schema (JSON Schema): ${propsJson}

REQUIREMENTS:
1. Create a React functional component (JSX, not TypeScript)
2. Use Tailwind CSS SEMANTIC COLOR CLASSES (these automatically adapt to light/dark mode):
   - Background: bg-background, bg-card, bg-muted, bg-muted/40, bg-accent, bg-primary
   - Text: text-foreground, text-muted-foreground, text-card-foreground, text-primary-foreground
   - Borders: border-border, border-input, border-muted
   - DO NOT use direct colors like bg-white, bg-gray-800, text-gray-900, etc.
   - DO NOT use dark: prefix - semantic classes handle dark mode automatically
3. Make it balanced - comfortable but efficient:
   - Use moderate padding: p-4, px-4 py-3 (balanced, not cramped or excessive)
   - Use appropriate text sizes: text-sm for body, text-base for headings, text-xs for captions
   - Use balanced spacing: gap-2.5, gap-3, space-y-2, mt-2, mb-3
   - Aim for a clean, professional look with good readability
4. Design for embedding - this component blends into existing content:
   - DO NOT add redundant titles or headers unless they're part of the actual data schema
   - Focus on displaying the data directly and elegantly
   - Assume the component is part of a larger conversation or content flow
   - If the schema has a "title" or "name" property, display it as data, not as a wrapper heading
5. Use LUCIDE-REACT ICONS to enhance UI aesthetics:
   - Import icons from lucide-react: import { User, Mail, Clock } from 'lucide-react'
   - Use icons with size-4 or size-5 classes for balanced visibility
   - Place icons inline with text or as visual indicators
   - Example: <User className="size-4" /> or <Mail className="size-4 text-muted-foreground" />
   - Common useful icons: User, Mail, Calendar, Clock, Check, X, Star, Heart, Settings, Search, etc.
6. The component should accept props that match the JSON Schema properties
7. Make it visually appealing and professional - clean with good whitespace
8. Use semantic HTML elements
9. Make it responsive and accessible
10. You can import icons from 'lucide-react' at the top
11. DO NOT include export statements - just the imports and function
12. DO NOT include TypeScript type annotations
13. Component name should be exactly: ${componentName}

AVAILABLE SEMANTIC COLOR CLASSES:
- Backgrounds: bg-background, bg-foreground, bg-card, bg-popover, bg-primary, bg-secondary, bg-muted, bg-accent, bg-destructive
- Text: text-foreground, text-background, text-card-foreground, text-popover-foreground, text-primary-foreground, text-secondary-foreground, text-muted-foreground, text-accent-foreground, text-destructive
- Borders: border-border, border-input, border-ring
- You can use opacity modifiers: bg-muted/40, bg-accent/10, etc.

OUTPUT FORMAT:
You need to generate two things:
1. "code": The complete React component code as a string
2. "data": Realistic sample data that matches the props schema (as a JSON object)

EXAMPLE OUTPUT (for a user profile schema with name, email, role):
{
  "code": "import { Mail, User } from 'lucide-react';\\n\\nfunction ${componentName}(props) {\\n  return (\\n    <div className=\\"p-4 rounded-lg border border-border bg-card\\">\\n      <div className=\\"flex items-center gap-2.5 mb-2\\">\\n        <User className=\\"size-4 text-muted-foreground\\" />\\n        <span className=\\"text-base font-medium text-foreground\\">{props.name}</span>\\n      </div>\\n      <div className=\\"flex items-center gap-2 text-sm text-muted-foreground\\">\\n        <Mail className=\\"size-4\\" />\\n        <span>{props.email}</span>\\n      </div>\\n      <div className=\\"text-xs text-muted-foreground mt-2\\">Role: {props.role}</div>\\n    </div>\\n  );\\n}",
  "data": {
    "name": "Sarah Chen",
    "email": "sarah.chen@example.com",
    "role": "Product Manager"
  }
}

REMEMBER:
- ONLY use semantic color classes (bg-card, text-foreground, etc.)
- NO direct colors (bg-white, text-gray-900, etc.)
- NO dark: prefix needed - semantic classes adapt automatically
- Use balanced spacing (p-4, gap-2.5/gap-3, text-sm for body, text-base for headings)
- Use lucide-react icons where appropriate for better UI
- NO redundant titles - just display the actual data from props
- Design for embedding - this blends into existing content, not a standalone card
- Make the sample data realistic and useful for previewing the component`;
}

function sanitizeComponentName(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

export default app;
