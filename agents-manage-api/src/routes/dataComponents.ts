import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDataComponent,
  DataComponentApiInsertSchema,
  DataComponentApiUpdateSchema,
  DataComponentListResponse,
  DataComponentResponse,
  deleteDataComponent,
  ErrorResponseSchema,
  getDataComponent,
  getProject,
  listDataComponentsPaginated,
  ModelFactory,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateDataComponent,
  validatePropsAsJsonSchema,
} from '@inkeep/agents-core';
import { streamObject } from 'ai';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Data Components',
    operationId: 'list-data-components',
    tags: ['Data Component'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of data components retrieved successfully',
        content: {
          'application/json': {
            schema: DataComponentListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listDataComponentsPaginated(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });
    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Data Component',
    operationId: 'get-data-component-by-id',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Data component found',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
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

    return c.json({ data: dataComponent });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Data Component',
    operationId: 'create-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DataComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Data component created successfully',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    if (body.props) {
      const propsValidation = validatePropsAsJsonSchema(body.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw createApiError({
          code: 'bad_request',
          message: `Invalid props schema: ${errorMessages}`,
        });
      }
    }

    const dataComponentData = {
      ...body,
      tenantId,
      projectId,
    };

    const dataComponent = await createDataComponent(dbClient)(dataComponentData);

    return c.json({ data: dataComponent }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Data Component',
    operationId: 'update-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DataComponentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Data component updated successfully',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    if (body.props !== undefined && body.props !== null) {
      const propsValidation = validatePropsAsJsonSchema(body.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw createApiError({
          code: 'bad_request',
          message: `Invalid props schema: ${errorMessages}`,
        });
      }
    }

    const updatedDataComponent = await updateDataComponent(dbClient)({
      scopes: { tenantId, projectId },
      dataComponentId: id,
      data: body,
    });

    if (!updatedDataComponent) {
      throw createApiError({
        code: 'not_found',
        message: 'Data component not found',
      });
    }

    return c.json({ data: updatedDataComponent });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Data Component',
    operationId: 'delete-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Data component deleted successfully',
      },
      404: {
        description: 'Data component not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteDataComponent(dbClient)({
      scopes: { tenantId, projectId },
      dataComponentId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Data component not found',
      });
    }

    return c.body(null, 204);
  }
);

const GenerateRenderRequestSchema = z.object({
  instructions: z.string().optional(),
  existingCode: z.string().optional(),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/generate-render',
    summary: 'Generate Data Component Render',
    operationId: 'generate-data-component-render',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: GenerateRenderRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Component render generated successfully (streaming NDJSON)',
        content: {
          'application/x-ndjson': {
            schema: z.object({
              component: z.string(),
              mockData: z.any(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  (async (c: any) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    const { instructions, existingCode } = body;

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

    if (!project) {
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    if (!project.models?.base) {
      throw createApiError({
        code: 'bad_request',
        message: 'Project base model configuration is required',
      });
    }

    const prompt = buildGenerationPrompt(dataComponent, instructions, existingCode);
    const modelConfig = ModelFactory.prepareGenerationConfig(project.models.base as any);

    const renderSchema = z.object({
      component: z.string().describe('The React component code'),
      mockData: z.any().describe('Sample data matching the props schema'),
    });

    const result = streamObject({
      ...modelConfig,
      prompt,
      schema: renderSchema,
      temperature: 0.7,
    });

    const existingData =
      existingCode &&
      dataComponent.render &&
      typeof dataComponent.render === 'object' &&
      'mockData' in dataComponent.render
        ? (dataComponent.render as any).mockData
        : null;

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const partialObject of result.partialObjectStream) {
            const outputObject =
              instructions && existingData
                ? { ...(partialObject as any), mockData: existingData }
                : partialObject;

            const line = `${JSON.stringify(outputObject)}\n`;
            controller.enqueue(new TextEncoder().encode(line));
          }
          controller.close();
        } catch (error) {
          console.error('Error streaming preview generation:', error);
          const errorLine = `${JSON.stringify({ component: '// Error generating component', mockData: {} })}\n`;
          controller.enqueue(new TextEncoder().encode(errorLine));
          controller.close();
        }
      },
    });

    return c.body(responseStream, 200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });
  }) as any
);

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
1. "component": The modified React component code as a string

Return ONLY the component field, the mockData field will be reused from the existing render.

EXAMPLE OUTPUT:
{
  "component": "import { Mail, User } from 'lucide-react';\\n\\nfunction ${componentName}(props) {\\n  // Modified component code here\\n}"
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
1. "component": The complete React component code as a string
2. "mockData": Realistic sample data that matches the props schema (as a JSON object)

EXAMPLE OUTPUT (for a user profile schema with name, email, role):
{
  "component": "import { Mail, User } from 'lucide-react';\\n\\nfunction ${componentName}(props) {\\n  return (\\n    <div className=\\"p-4 rounded-lg border border-border bg-card\\">\\n      <div className=\\"flex items-center gap-2.5 mb-2\\">\\n        <User className=\\"size-4 text-muted-foreground\\" />\\n        <span className=\\"text-base font-medium text-foreground\\">{props.name}</span>\\n      </div>\\n      <div className=\\"flex items-center gap-2 text-sm text-muted-foreground\\">\\n        <Mail className=\\"size-4\\" />\\n        <span>{props.email}</span>\\n      </div>\\n      <div className=\\"text-xs text-muted-foreground mt-2\\">Role: {props.role}</div>\\n    </div>\\n  );\\n}",
  "mockData": {
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
