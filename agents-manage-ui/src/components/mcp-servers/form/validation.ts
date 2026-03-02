import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

// Discriminated union for tool selection
const toolsConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('all'),
  }),
  z.object({
    type: z.literal('selective'),
    tools: z.array(z.string()),
  }),
]);

export const CredentialScopeEnum = {
  project: 'project',
  user: 'user',
} as const;

export type CredentialScope = (typeof CredentialScopeEnum)[keyof typeof CredentialScopeEnum];

// Dangerous pattern detection for transformations
const DANGEROUS_PATTERNS = [
  /\$\{.*\}/, // Template injection
  /eval\s*\(/i, // Eval calls
  /function\s*\(/i, // Function definitions
  /constructor/i, // Constructor access
  /prototype/i, // Prototype manipulation
  /__proto__/i, // Proto access
];

// Custom validation for JMESPath transformations
const validateTransformation = (value: string | Record<string, string>): boolean => {
  if (typeof value === 'string') {
    // Validate JMESPath expression
    if (value.length > 500) return false;
    return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (typeof value === 'object' && value !== null) {
    // Validate object mapping
    for (const [key, val] of Object.entries(value)) {
      if (typeof key !== 'string' || typeof val !== 'string') return false;
      if (!key.trim() || !val.trim()) return false;
      if (val.length > 200) return false;
      if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(val))) return false;
    }
    return true;
  }
  return false;
};

export const mcpToolSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  config: z.object({
    type: z.literal('mcp'),
    mcp: z.object({
      server: z.object({
        url: z
          .string()
          .url('Must be a valid URL.')
          .refine(
            (url) => {
              try {
                const parsed = new URL(url);
                return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
              } catch {
                return false;
              }
            },
            { message: 'URL must use http, https, ws, or wss protocol.' }
          ),
      }),
      transport: z.object({
        type: z.nativeEnum(MCPTransportType),
      }),
      toolsConfig: toolsConfigSchema.default({ type: 'all' }),
      toolOverrides: z
        .record(
          z.string().min(1, 'Tool name cannot be empty.'),
          z.object({
            displayName: z
              .string()
              .max(100, 'Display name must be less than 100 characters.')
              .regex(
                /^[a-zA-Z0-9_-]+$/,
                'Display name can only contain letters, numbers, hyphens, and underscores.'
              )
              .optional(),
            description: z
              .string()
              .max(1000, 'Description must be less than 1000 characters.')
              .optional(),
            schema: z
              .any()
              .refine(
                (schema) => {
                  if (!schema) return true;
                  try {
                    if (typeof schema === 'string') {
                      const parsed = JSON.parse(schema);
                      return typeof parsed === 'object' && parsed !== null;
                    }
                    return typeof schema === 'object' && schema !== null;
                  } catch {
                    return false;
                  }
                },
                { message: 'Schema must be a valid JSON object.' }
              )
              .optional(),
            transformation: z
              .union([
                z
                  .string()
                  .max(500, 'JMESPath expression must be less than 500 characters.')
                  .refine((value) => !DANGEROUS_PATTERNS.some((pattern) => pattern.test(value)), {
                    message: 'Transformation contains potentially dangerous patterns.',
                  }), // JMESPath expression
                z
                  .record(z.string(), z.string())
                  .refine(validateTransformation, {
                    message: 'Invalid object transformation mapping.',
                  }), // object mapping
              ])
              .optional(),
          })
        )
        .optional(),
      prompt: z.string().max(2000, 'Prompt must be less than 2000 characters.').optional(),
    }),
  }),
  credentialReferenceId: z.string().nullish(),
  credentialScope: z.enum(CredentialScopeEnum).default('project'),
  imageUrl: z
    .string()
    .optional()
    .refine((value) => !value || value.trim() === '' || z.string().url().safeParse(value).success, {
      message: 'Image URL must be a valid URL.',
    }),
});

export type MCPToolFormData = z.infer<typeof mcpToolSchema>;
