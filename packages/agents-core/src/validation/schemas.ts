import { parse } from '@babel/parser';
import { z } from '@hono/zod-openapi';
import { schemaValidationDefaults } from '../constants/schema-validation/defaults';
// Config DB imports (Doltgres - versioned)
import {
  agents,
  artifactComponents,
  contextConfigs,
  credentialReferences,
  dataComponents,
  dataset,
  datasetItem,
  datasetRunConfig,
  datasetRunConfigAgentRelations,
  evaluationJobConfig,
  evaluationJobConfigEvaluatorRelations,
  evaluationRunConfig,
  evaluationRunConfigEvaluationSuiteConfigRelations,
  evaluationSuiteConfig,
  evaluationSuiteConfigEvaluatorRelations,
  evaluator,
  externalAgents,
  functions,
  functionTools,
  projects,
  scheduledTriggers,
  scheduledWorkflows,
  skills,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentExternalAgentRelations,
  subAgentFunctionToolRelations,
  subAgentRelations,
  subAgentSkills,
  subAgents,
  subAgentTeamAgentRelations,
  subAgentToolRelations,
  tools,
  triggers,
} from '../db/manage/manage-schema';
// Runtime DB imports (Postgres - not versioned)
import {
  apiKeys,
  contextCache,
  conversations,
  datasetRun,
  datasetRunConversationRelations,
  evaluationResult,
  evaluationRun,
  ledgerArtifacts,
  messages,
  projectMetadata,
  scheduledTriggerInvocations,
  taskRelations,
  tasks,
  triggerInvocations,
  workAppGitHubInstallations,
  workAppGitHubMcpToolRepositoryAccess,
  workAppGitHubProjectRepositoryAccess,
  workAppGitHubRepositories,
  workAppSlackChannelAgentConfigs,
  workAppSlackWorkspaces,
} from '../db/runtime/runtime-schema';
import {
  CredentialStoreType,
  MCPServerType,
  MCPTransportType,
  TOOL_STATUS_VALUES,
  VALID_RELATION_TYPES,
} from '../types/utility';
import { jmespathString, validateJMESPathSecure, validateRegex } from '../utils/jmespath-utils';
import { ResolvedRefSchema } from './dolt-schemas';
import {
  createInsertSchema,
  createSelectSchema,
  registerFieldSchemas,
} from './drizzle-schema-helpers';
import {
  ArtifactComponentExtendSchema,
  DataComponentExtendSchema,
  DescriptionSchema,
  NameSchema,
} from './extend-schemas';

// Destructure defaults for use in schemas
const {
  AGENT_EXECUTION_TRANSFER_COUNT_MAX,
  AGENT_EXECUTION_TRANSFER_COUNT_MIN,
  CONTEXT_FETCHER_HTTP_TIMEOUT_MS_DEFAULT,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS,
  STATUS_UPDATE_MAX_NUM_EVENTS,
  SUB_AGENT_TURN_GENERATION_STEPS_MAX,
  SUB_AGENT_TURN_GENERATION_STEPS_MIN,
  VALIDATION_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
} = schemaValidationDefaults;

export const StringRecordSchema = z
  .record(z.string(), z.string('All object values must be strings'), 'Must be valid JSON object')
  .openapi('StringRecord');

// A2A Part Schemas
// These Zod schemas mirror the Part types defined in types/a2a.ts

const PartMetadataSchema = z.record(z.string(), z.any()).optional();

export const TextPartSchema = z
  .object({
    kind: z.literal('text'),
    text: z.string(),
    metadata: PartMetadataSchema,
  })
  .openapi('TextPart');

const FileWithBytesSchema = z
  .object({
    name: z.string().optional(),
    mimeType: z.string().optional(),
    bytes: z.string(),
  })
  .strict();

const FileWithUriSchema = z
  .object({
    name: z.string().optional(),
    mimeType: z.string().optional(),
    uri: z.string(),
  })
  .strict();

export const FilePartSchema = z
  .object({
    kind: z.literal('file'),
    file: z.union([FileWithBytesSchema, FileWithUriSchema]),
    metadata: PartMetadataSchema,
  })
  .openapi('FilePart');

export const DataPartSchema = z
  .object({
    kind: z.literal('data'),
    data: z.record(z.string(), z.any()),
    metadata: PartMetadataSchema,
  })
  .openapi('DataPart');

export const PartSchema = z
  .discriminatedUnion('kind', [TextPartSchema, FilePartSchema, DataPartSchema])
  .openapi('Part');

export type PartSchemaType = z.infer<typeof PartSchema>;

export const StopWhenSchema = z
  .object({
    transferCountIs: z
      .number()
      .min(AGENT_EXECUTION_TRANSFER_COUNT_MIN)
      .max(AGENT_EXECUTION_TRANSFER_COUNT_MAX)
      .optional()
      .describe('The maximum number of transfers to trigger the stop condition.'),
    stepCountIs: z
      .number()
      .min(SUB_AGENT_TURN_GENERATION_STEPS_MIN)
      .max(SUB_AGENT_TURN_GENERATION_STEPS_MAX)
      .optional()
      .describe('The maximum number of steps to trigger the stop condition.'),
  })
  .openapi('StopWhen');

export const AgentStopWhenSchema = StopWhenSchema.pick({ transferCountIs: true }).openapi(
  'AgentStopWhen'
);

export const SubAgentStopWhenSchema = StopWhenSchema.pick({ stepCountIs: true }).openapi(
  'SubAgentStopWhen'
);

export type StopWhen = z.infer<typeof StopWhenSchema>;
export type AgentStopWhen = z.infer<typeof AgentStopWhenSchema>;
export type SubAgentStopWhen = z.infer<typeof SubAgentStopWhenSchema>;

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const ResourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  })
  .refine((value) => value !== 'new', 'Must not use a reserved name "new"')
  .openapi('ResourceId', {
    description: 'Resource identifier',
    example: 'resource_789',
  });

const pageNumber = z.coerce.number().min(1).default(1).openapi('PaginationPageQueryParam');
const limitNumber = z.coerce
  .number()
  .min(1)
  .max(100)
  .default(10)
  .openapi('PaginationLimitQueryParam');

export const ModelSettingsSchema = z
  .object({
    model: z.string().optional().describe('The model to use for the project.'),
    providerOptions: z
      .record(z.string(), z.any())
      .optional()
      .describe('The provider options to use for the project.'),
  })
  .openapi('ModelSettings');

export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export const SimulationAgentSchema = z
  .object({
    stopWhen: StopWhenSchema.optional(),
    prompt: z.string(),
    model: ModelSettingsSchema,
  })
  .openapi('SimulationAgent');

export type SimulationAgent = z.infer<typeof SimulationAgentSchema>;

export const ModelSchema = z
  .object({
    base: ModelSettingsSchema.optional(),
    structuredOutput: ModelSettingsSchema.optional(),
    summarizer: ModelSettingsSchema.optional(),
  })
  .openapi('Model');

export const ProjectModelSchema = z
  .object({
    base: ModelSettingsSchema,
    structuredOutput: ModelSettingsSchema.optional(),
    summarizer: ModelSettingsSchema.optional(),
  })
  .openapi('ProjectModel');

export const FunctionToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  dependencies: z.record(z.string(), z.string()).optional(),
  execute: z.union([z.function(), z.string()]),
});

export type FunctionToolConfig = Omit<z.infer<typeof FunctionToolConfigSchema>, 'execute'> & {
  execute: ((params: any) => Promise<any>) | string;
};

// Helper functions for creating API schemas by omitting internal scope fields.
// Zod's .omit() type signature requires exact key matching which doesn't work with generics.
// We use type assertions with explicit return types to maintain type safety at call sites.
type OmitProjectScope<T> = Omit<T, 'tenantId' | 'projectId'>;
type OmitAgentScope<T> = Omit<T, 'tenantId' | 'projectId' | 'agentId'>;
type OmitTenantScope<T> = Omit<T, 'tenantId'>;
type OmitTimestamps<T> = Omit<T, 'createdAt' | 'updatedAt'>;
type OmitGeneratedFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

// Generic helper for tenant-scoped entities (omits only tenantId, not projectId)
const omitTenantScope = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitTenantScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true }) as z.ZodObject<
    OmitTenantScope<T>
  >;

// Generic helper for omitting timestamp fields
const omitTimestamps = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitTimestamps<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    createdAt: true,
    updatedAt: true,
  }) as z.ZodObject<OmitTimestamps<T>>;

// Generic helper for omitting auto-generated fields (common for API insert schemas)
const omitGeneratedFields = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitGeneratedFields<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  }) as z.ZodObject<OmitGeneratedFields<T>>;

const createApiSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitProjectScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
    OmitProjectScope<T>
  >;

const createApiInsertSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitProjectScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
    OmitProjectScope<T>
  >;

const createApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  (
    (schema as z.ZodObject<z.ZodRawShape>).omit({ tenantId: true, projectId: true }) as z.ZodObject<
      OmitProjectScope<T>
    >
  ).partial();

const createAgentScopedApiSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitAgentScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    tenantId: true,
    projectId: true,
    agentId: true,
  }) as z.ZodObject<OmitAgentScope<T>>;

const createAgentScopedApiInsertSchema = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): z.ZodObject<OmitAgentScope<T>> =>
  (schema as z.ZodObject<z.ZodRawShape>).omit({
    tenantId: true,
    projectId: true,
    agentId: true,
  }) as z.ZodObject<OmitAgentScope<T>>;

const createAgentScopedApiUpdateSchema = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  (
    (schema as z.ZodObject<z.ZodRawShape>).omit({
      tenantId: true,
      projectId: true,
      agentId: true,
    }) as z.ZodObject<OmitAgentScope<T>>
  ).partial();

export const SubAgentSelectSchema = createSelectSchema(subAgents);

export const SubAgentInsertSchema = createInsertSchema(subAgents).extend({
  id: ResourceIdSchema,
  models: ModelSchema.optional(),
});

export const SubAgentUpdateSchema = SubAgentInsertSchema.partial();

export const SubAgentApiSelectSchema =
  createAgentScopedApiSchema(SubAgentSelectSchema).openapi('SubAgent');
export const SubAgentApiInsertSchema =
  createAgentScopedApiInsertSchema(SubAgentInsertSchema).openapi('SubAgentCreate');
export const SubAgentApiUpdateSchema =
  createAgentScopedApiUpdateSchema(SubAgentUpdateSchema).openapi('SubAgentUpdate');

export const SubAgentRelationSelectSchema = createSelectSchema(subAgentRelations);
export const SubAgentRelationInsertSchema = createInsertSchema(subAgentRelations).extend({
  id: ResourceIdSchema,
  agentId: ResourceIdSchema,
  sourceSubAgentId: ResourceIdSchema,
  targetSubAgentId: ResourceIdSchema.optional(),
  externalSubAgentId: ResourceIdSchema.optional(),
  teamSubAgentId: ResourceIdSchema.optional(),
});
export const SubAgentRelationUpdateSchema = SubAgentRelationInsertSchema.partial();

export const SubAgentRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentRelationSelectSchema
).openapi('SubAgentRelation');
export const SubAgentRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentRelationInsertSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES),
  })
  .refine(
    (data) => {
      const hasTarget = data.targetSubAgentId != null;
      const hasExternal = data.externalSubAgentId != null;
      const hasTeam = data.teamSubAgentId != null;
      const count = [hasTarget, hasExternal, hasTeam].filter(Boolean).length;
      return count === 1; // Exactly one must be true
    },
    {
      message:
        'Must specify exactly one of targetSubAgentId, externalSubAgentId, or teamSubAgentId',
      path: ['targetSubAgentId', 'externalSubAgentId', 'teamSubAgentId'],
    }
  )
  .openapi('SubAgentRelationCreate');

export const SubAgentRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentRelationUpdateSchema
)
  .extend({
    relationType: z.enum(VALID_RELATION_TYPES).optional(),
  })
  .refine(
    (data) => {
      const hasTarget = data.targetSubAgentId != null;
      const hasExternal = data.externalSubAgentId != null;
      const hasTeam = data.teamSubAgentId != null;
      const count = [hasTarget, hasExternal, hasTeam].filter(Boolean).length;

      if (count === 0) {
        return true; // No relationship specified - valid for updates
      }

      return count === 1; // Exactly one must be true
    },
    {
      message:
        'Must specify exactly one of targetSubAgentId, externalSubAgentId, or teamSubAgentId when updating sub-agent relationships',
      path: ['targetSubAgentId', 'externalSubAgentId', 'teamSubAgentId'],
    }
  )
  .openapi('SubAgentRelationUpdate');

export const SubAgentRelationQuerySchema = z.object({
  sourceSubAgentId: z.string().optional(),
  targetSubAgentId: z.string().optional(),
  externalSubAgentId: z.string().optional(),
  teamSubAgentId: z.string().optional(),
});

export const ExternalSubAgentRelationInsertSchema = createInsertSchema(subAgentRelations).extend({
  id: ResourceIdSchema,
  agentId: ResourceIdSchema,
  sourceSubAgentId: ResourceIdSchema,
  externalSubAgentId: ResourceIdSchema,
});

export const ExternalSubAgentRelationApiInsertSchema = createApiInsertSchema(
  ExternalSubAgentRelationInsertSchema
);

export const AgentSelectSchema = createSelectSchema(agents);

export const AgentInsertSchema = createInsertSchema(agents, {
  id: () => ResourceIdSchema,
  name: () => NameSchema,
  description: () => DescriptionSchema,
  defaultSubAgentId: () =>
    ResourceIdSchema.clone()
      .nullable()
      .optional()
      .openapi({
        description:
          'ID of the default sub-agent that handles initial user messages. ' +
          'Required at runtime but nullable on creation to avoid circular FK dependency. ' +
          'Workflow: 1) POST Agent (without defaultSubAgentId), 2) POST SubAgent, 3) PATCH Agent with defaultSubAgentId.',
        example: 'my-default-subagent',
      }),
});
export const AgentUpdateSchema = AgentInsertSchema.partial();

export const AgentApiSelectSchema = createApiSchema(AgentSelectSchema).openapi('Agent');
export const AgentApiInsertSchema = createApiInsertSchema(AgentInsertSchema)
  .extend({
    id: ResourceIdSchema,
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .openapi('AgentCreate');
export const AgentApiUpdateSchema = createApiUpdateSchema(AgentUpdateSchema).openapi('AgentUpdate');

// Trigger authentication schemas
// Input schema: what users submit via API (plaintext header values)
export const TriggerAuthHeaderInputSchema = z.object({
  name: z.string().min(1).describe('Header name (e.g., X-API-Key, Authorization)'),
  value: z.string().min(1).describe('Expected header value (plaintext)'),
});

// Update schema: allows keeping existing header values without re-entering
export const TriggerAuthHeaderUpdateSchema = z.object({
  name: z.string().min(1).describe('Header name (e.g., X-API-Key, Authorization)'),
  value: z
    .string()
    .optional()
    .describe('New header value (plaintext). If omitted, existing value is kept.'),
  keepExisting: z
    .boolean()
    .optional()
    .describe('If true, keep the existing hashed value for this header'),
});

export const TriggerAuthenticationInputSchema = z
  .object({
    headers: z
      .array(TriggerAuthHeaderInputSchema)
      .optional()
      .describe('Array of headers to validate on incoming requests'),
  })
  .openapi('TriggerAuthenticationInput');

// Update schema for authentication: supports keepExisting flag for headers
export const TriggerAuthenticationUpdateSchema = z
  .object({
    headers: z
      .array(TriggerAuthHeaderUpdateSchema)
      .optional()
      .describe('Array of headers. Use keepExisting:true to preserve existing hashed value.'),
  })
  .openapi('TriggerAuthenticationUpdate');

// Stored schema: what gets saved in database (hashed values)
export const TriggerAuthHeaderStoredSchema = z.object({
  name: z.string().describe('Header name'),
  valueHash: z.string().describe('Hash of the expected header value'),
  valuePrefix: z.string().describe('First 8 chars of value for display'),
});

export const TriggerAuthenticationStoredSchema = z
  .object({
    headers: z
      .array(TriggerAuthHeaderStoredSchema)
      .optional()
      .describe('Array of headers with hashed values'),
  })
  .openapi('TriggerAuthenticationStored');

// For backwards compatibility, TriggerAuthenticationSchema is the input schema
export const TriggerAuthenticationSchema = TriggerAuthenticationInputSchema;

export const TriggerOutputTransformSchema = z
  .object({
    jmespath: jmespathString().optional(),
    objectTransformation: z
      .record(z.string(), z.string())
      .optional()
      .describe('Object transformation mapping'),
  })
  .openapi('TriggerOutputTransform');

/**
 * Configuration for extracting the webhook signature from an incoming request.
 *
 * The signature can be located in HTTP headers, query parameters, or the request body.
 * Supports prefix stripping and regex extraction for complex signature formats.
 *
 * @example
 * // GitHub: Extract from header with prefix
 * { source: 'header', key: 'X-Hub-Signature-256', prefix: 'sha256=' }
 *
 * @example
 * // Stripe: Extract from header using regex
 * { source: 'header', key: 'Stripe-Signature', regex: 'v1=([a-f0-9]+)' }
 *
 * @example
 * // Custom: Extract from body using JMESPath
 * { source: 'body', key: 'metadata.signature' }
 */
export const SignatureSourceSchema = z
  .object({
    source: z
      .enum(['header', 'query', 'body'])
      .describe('Location of the signature in the incoming request'),
    key: z.string().describe('Key name for the signature (header name, query param, or JMESPath)'),
    prefix: z
      .string()
      .optional()
      .describe('Optional prefix to strip from signature value (e.g., "sha256=", "v0=")'),
    regex: z
      .string()
      .optional()
      .describe(
        'Optional regex pattern to extract signature from value (first capture group used)'
      ),
  })
  .openapi('SignatureSource');

/**
 * Configuration for a single component that is part of the signed data.
 *
 * Webhook providers often sign multiple pieces of data together (e.g., timestamp + body).
 * Components are extracted from the request and joined in order before verification.
 *
 * @example
 * // GitHub: Sign only the body
 * { source: 'body', required: true }
 *
 * @example
 * // Slack: Sign literal version + timestamp header + body
 * { source: 'literal', value: 'v0', required: true }
 * { source: 'header', key: 'X-Slack-Request-Timestamp', required: true }
 * { source: 'body', required: true }
 *
 * @example
 * // Stripe: Extract timestamp from header using regex
 * { source: 'header', key: 'Stripe-Signature', regex: 't=([0-9]+)', required: true }
 */
export const SignedComponentSchema = z
  .object({
    source: z
      .enum(['header', 'body', 'literal'])
      .describe('Source of the component: header value, body via JMESPath, or literal string'),
    key: z
      .string()
      .optional()
      .describe('Key for header name or JMESPath expression (required for header/body sources)'),
    value: z.string().optional().describe('Literal string value (required for literal source)'),
    regex: z
      .string()
      .optional()
      .describe('Optional regex pattern to extract from component value (first capture group)'),
    required: z
      .boolean()
      .default(true)
      .describe('If false, missing component results in empty string instead of error'),
  })
  .openapi('SignedComponent');

/**
 * Configuration for how to join multiple signed components into a single string.
 *
 * Different webhook providers use different separators between components.
 *
 * @example
 * // GitHub/Zendesk: Direct concatenation (empty separator)
 * { strategy: 'concatenate', separator: '' }
 *
 * @example
 * // Slack: Colon separator
 * { strategy: 'concatenate', separator: ':' }
 *
 * @example
 * // Stripe: Dot separator
 * { strategy: 'concatenate', separator: '.' }
 */
export const ComponentJoinSchema = z
  .object({
    strategy: z.enum(['concatenate']).describe('Strategy for joining components'),
    separator: z.string().describe('String to insert between joined components'),
  })
  .openapi('ComponentJoin');

/**
 * Advanced validation options for fine-grained control over signature verification.
 *
 * These options control edge case behavior and should generally use default values.
 *
 * @example
 * // Strict validation for security-critical webhooks
 * {
 *   headerCaseSensitive: true,
 *   allowEmptyBody: false,
 *   normalizeUnicode: true
 * }
 */
export const SignatureValidationOptionsSchema = z
  .object({
    headerCaseSensitive: z
      .boolean()
      .default(false)
      .describe('If true, header names are matched case-sensitively'),
    allowEmptyBody: z
      .boolean()
      .default(true)
      .describe('If true, allow empty request body for verification'),
    normalizeUnicode: z
      .boolean()
      .default(false)
      .describe('If true, normalize Unicode strings to NFC form before signing'),
  })
  .openapi('SignatureValidationOptions');

/**
 * Complete configuration for webhook HMAC signature verification.
 *
 * Supports flexible, provider-agnostic signature verification for webhooks from
 * GitHub, Slack, Stripe, Zendesk, and other providers.
 *
 * SECURITY: Always use credential references to store signing secrets. Never hardcode
 * secrets in your configuration. Prefer sha256 or stronger algorithms.
 *
 * @example
 * // GitHub webhook verification
 * {
 *   algorithm: 'sha256',
 *   encoding: 'hex',
 *   signature: { source: 'header', key: 'X-Hub-Signature-256', prefix: 'sha256=' },
 *   signedComponents: [{ source: 'body', required: true }],
 *   componentJoin: { strategy: 'concatenate', separator: '' }
 * }
 *
 * @example
 * // Slack webhook verification with multi-component signing
 * {
 *   algorithm: 'sha256',
 *   encoding: 'hex',
 *   signature: { source: 'header', key: 'X-Slack-Signature', prefix: 'v0=' },
 *   signedComponents: [
 *     { source: 'literal', value: 'v0', required: true },
 *     { source: 'header', key: 'X-Slack-Request-Timestamp', required: true },
 *     { source: 'body', required: true }
 *   ],
 *   componentJoin: { strategy: 'concatenate', separator: ':' }
 * }
 *
 * @example
 * // Stripe webhook verification with regex extraction
 * {
 *   algorithm: 'sha256',
 *   encoding: 'hex',
 *   signature: { source: 'header', key: 'Stripe-Signature', regex: 'v1=([a-f0-9]+)' },
 *   signedComponents: [
 *     { source: 'header', key: 'Stripe-Signature', regex: 't=([0-9]+)', required: true },
 *     { source: 'body', required: true }
 *   ],
 *   componentJoin: { strategy: 'concatenate', separator: '.' }
 * }
 */
export const SignatureVerificationConfigSchema = z
  .object({
    algorithm: z
      .enum(['sha256', 'sha512', 'sha384', 'sha1', 'md5'])
      .describe('HMAC algorithm to use for signature verification'),
    encoding: z
      .enum(['hex', 'base64'])
      .describe('Encoding format of the signature (hex or base64)'),
    signature: SignatureSourceSchema.describe('Configuration for extracting the signature'),
    signedComponents: z
      .array(SignedComponentSchema)
      .min(1)
      .describe('Array of components that are signed (order matters)'),
    componentJoin: ComponentJoinSchema.describe('How to join signed components'),
    validation: SignatureValidationOptionsSchema.optional().describe('Advanced validation options'),
  })
  .openapi('SignatureVerificationConfig');

/**
 * Complete configuration for webhook HMAC signature verification.
 *
 * Use this type when working with signature verification in TypeScript.
 * See SignatureVerificationConfigSchema for detailed examples and validation.
 */
export type SignatureVerificationConfig = z.infer<typeof SignatureVerificationConfigSchema>;

/**
 * Configuration for extracting the webhook signature from an incoming request.
 *
 * See SignatureSourceSchema for detailed examples and validation.
 */
export type SignatureSource = z.infer<typeof SignatureSourceSchema>;

/**
 * Configuration for a single component that is part of the signed data.
 *
 * See SignedComponentSchema for detailed examples and validation.
 */
export type SignedComponent = z.infer<typeof SignedComponentSchema>;

/**
 * Configuration for how to join multiple signed components into a single string.
 *
 * See ComponentJoinSchema for detailed examples and validation.
 */
export type ComponentJoin = z.infer<typeof ComponentJoinSchema>;

/**
 * Advanced validation options for fine-grained control over signature verification.
 *
 * See SignatureValidationOptionsSchema for detailed examples and validation.
 */
export type SignatureValidationOptions = z.infer<typeof SignatureValidationOptionsSchema>;

export const TriggerInvocationStatusEnum = z.enum(['pending', 'success', 'failed']);

export const TriggerSelectSchema = registerFieldSchemas(
  createSelectSchema(triggers).extend({
    signingSecretCredentialReferenceId: z.string().nullable().optional(),
    signatureVerification: SignatureVerificationConfigSchema.nullable().optional(),
  })
);

export const TriggerInsertSchema = createInsertSchema(triggers, {
  id: () => ResourceIdSchema,
  name: () => z.string().trim().nonempty().describe('Trigger name'),
  description: () => z.string().optional().describe('Trigger description'),
  enabled: () => z.boolean().default(true).describe('Whether the trigger is enabled'),
  inputSchema: () =>
    z.record(z.string(), z.unknown()).optional().describe('JSON Schema for input validation'),
  outputTransform: () => TriggerOutputTransformSchema.optional(),
  messageTemplate: () =>
    z
      .string()
      .trim()
      .nonempty()
      .describe('Message template with {{placeholder}} syntax')
      .optional(),
  authentication: () => TriggerAuthenticationInputSchema.optional(),
  signingSecretCredentialReferenceId: () =>
    z.string().optional().describe('Reference to credential containing signing secret'),
  signatureVerification: () =>
    SignatureVerificationConfigSchema.nullish()
      .superRefine((config, ctx) => {
        if (!config) return;
        // Validate signature.regex if present
        if (config.signature.regex) {
          const regexResult = validateRegex(config.signature.regex);
          if (!regexResult.valid) {
            ctx.addIssue({
              code: 'custom',
              message: `Invalid regex pattern in signature.regex: ${regexResult.error}`,
              path: ['signatureVerification', 'signature', 'regex'],
            });
          }
        }

        // Validate signature.key as JMESPath if source is 'body'
        if (config.signature.source === 'body' && config.signature.key) {
          const jmespathResult = validateJMESPathSecure(config.signature.key);
          if (!jmespathResult.valid) {
            ctx.addIssue({
              code: 'custom',
              message: `Invalid JMESPath expression in signature.key: ${jmespathResult.error}`,
              path: ['signatureVerification', 'signature', 'key'],
            });
          }
        }

        // Validate each signed component
        config.signedComponents.forEach((component, index) => {
          // Validate component.regex if present
          if (component.regex) {
            const regexResult = validateRegex(component.regex);
            if (!regexResult.valid) {
              ctx.addIssue({
                code: 'custom',
                message: `Invalid regex pattern in signedComponents[${index}].regex: ${regexResult.error}`,
                path: ['signatureVerification', 'signedComponents', index, 'regex'],
              });
            }
          }

          // Validate component.key as JMESPath if source is 'body'
          if (component.source === 'body' && component.key) {
            const jmespathResult = validateJMESPathSecure(component.key);
            if (!jmespathResult.valid) {
              ctx.addIssue({
                code: 'custom',
                message: `Invalid JMESPath expression in signedComponents[${index}].key: ${jmespathResult.error}`,
                path: ['signatureVerification', 'signedComponents', index, 'key'],
              });
            }
          }

          // Validate component.value as JMESPath if provided (for header/body extraction)
          if (component.value && component.source !== 'literal') {
            // For non-literal sources, value might be a JMESPath expression
            // Only validate if it looks like a JMESPath expression
            if (component.value.includes('.') || component.value.includes('[')) {
              const jmespathResult = validateJMESPathSecure(component.value);
              if (!jmespathResult.valid) {
                ctx.addIssue({
                  code: 'custom',
                  message: `Invalid JMESPath expression in signedComponents[${index}].value: ${jmespathResult.error}`,
                  path: ['signatureVerification', 'signedComponents', index, 'value'],
                });
              }
            }
          }
        });
      })
      .describe('Configuration for webhook signature verification'),
});

// For updates, we create a schema without defaults so that {} is detected as empty
// (TriggerInsertSchema has enabled.default(true) which would make {} parse to {enabled:true})
// We use .removeDefault() to strip the default from enabled field
export const TriggerUpdateSchema = TriggerInsertSchema.extend({
  // Override enabled to remove the default so {} doesn't become {enabled: true}
  enabled: z.boolean().optional().describe('Whether the trigger is enabled'),
}).partial();

export const TriggerApiSelectSchema =
  createAgentScopedApiSchema(TriggerSelectSchema).openapi('Trigger');
export const TriggerApiInsertSchema = createAgentScopedApiInsertSchema(TriggerInsertSchema)
  .extend({
    id: ResourceIdSchema.optional(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .openapi('TriggerCreate');
export const TriggerApiUpdateSchema = TriggerUpdateSchema.openapi('TriggerUpdate');

// Extended Trigger schema with webhookUrl (for manage API responses)
// Note: This extends the base TriggerApiSelectSchema to add the computed webhookUrl field
export const TriggerWithWebhookUrlSchema = TriggerApiSelectSchema.extend({
  webhookUrl: z.string().describe('Fully qualified webhook URL for this trigger'),
}).openapi('TriggerWithWebhookUrl');

// Trigger Invocation schemas
export const TriggerInvocationSelectSchema = createSelectSchema(triggerInvocations);

export const TriggerInvocationInsertSchema = createInsertSchema(triggerInvocations, {
  id: () => ResourceIdSchema,
  triggerId: () => ResourceIdSchema,
  conversationId: () => ResourceIdSchema.optional(),
  status: () => TriggerInvocationStatusEnum.default('pending'),
  requestPayload: () => z.record(z.string(), z.unknown()).describe('Original webhook payload'),
  transformedPayload: () =>
    z.record(z.string(), z.unknown()).optional().describe('Transformed payload'),
  errorMessage: () => z.string().optional().describe('Error message if status is failed'),
});

export const TriggerInvocationUpdateSchema = TriggerInvocationInsertSchema.partial();

export const TriggerInvocationApiSelectSchema = createAgentScopedApiSchema(
  TriggerInvocationSelectSchema
).openapi('TriggerInvocation');
export const TriggerInvocationApiInsertSchema = createAgentScopedApiInsertSchema(
  TriggerInvocationInsertSchema
)
  .extend({
    id: ResourceIdSchema,
  })
  .openapi('TriggerInvocationCreate');
export const TriggerInvocationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  TriggerInvocationUpdateSchema
).openapi('TriggerInvocationUpdate');

// Scheduled Trigger Schemas

export const CronExpressionSchema = z
  .string()
  .regex(
    /^(\*(?:\/\d+)?|[\d,-]+(?:\/\d+)?)\s+(\*(?:\/\d+)?|[\d,-]+(?:\/\d+)?)\s+(\*(?:\/\d+)?|[\d,-]+(?:\/\d+)?)\s+(\*(?:\/\d+)?|[\d,-]+(?:\/\d+)?)\s+(\*(?:\/\d+)?|[\d,\-A-Za-z]+(?:\/\d+)?)$/,
    'Invalid cron expression. Expected 5 fields: minute hour day month weekday'
  )
  .describe('Cron expression in standard 5-field format (minute hour day month weekday)')
  .openapi('CronExpression');

export const ScheduledTriggerSelectSchema = createSelectSchema(scheduledTriggers).extend({
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  createdBy: z.string().nullable().describe('User ID of the user who created this trigger'),
});

const ScheduledTriggerInsertSchemaBase = createInsertSchema(scheduledTriggers, {
  id: () => ResourceIdSchema,
  name: () => z.string().trim().min(1).describe('Scheduled trigger name'),
  description: () => z.string().optional().describe('Scheduled trigger description'),
  enabled: () => z.boolean().default(true).describe('Whether the trigger is enabled'),
  cronExpression: () => CronExpressionSchema.nullable().optional(),
  cronTimezone: () =>
    z
      .string()
      .max(64)
      .default('UTC')
      .describe('IANA timezone for cron expression (e.g., America/New_York, Europe/London)'),
  runAt: () => z.iso.datetime().nullable().optional().describe('One-time execution timestamp'),
  payload: () =>
    z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe('Static payload for agent execution'),
  messageTemplate: () =>
    z.string().trim().min(1).describe('Message template with {{placeholder}} syntax').optional(),
  maxRetries: () => z.number().int().min(0).max(10).default(1),
  retryDelaySeconds: () => z.number().int().min(10).max(3600).default(60),
  timeoutSeconds: () => z.number().int().min(30).max(780).default(780),
  createdBy: () =>
    z.string().nullable().optional().describe('User ID of the user who created this trigger'),
}).omit({
  createdAt: true,
  updatedAt: true,
});

export const ScheduledTriggerInsertSchema = ScheduledTriggerInsertSchemaBase.refine(
  (data) => data.cronExpression || data.runAt,
  { message: 'Either cronExpression or runAt must be provided' }
).refine((data) => !(data.cronExpression && data.runAt), {
  message: 'Cannot specify both cronExpression and runAt',
});

export const ScheduledTriggerUpdateSchema = ScheduledTriggerInsertSchemaBase.extend({
  enabled: z.boolean().optional().describe('Whether the trigger is enabled'),
}).partial();

export const ScheduledTriggerApiSelectSchema = createAgentScopedApiSchema(
  ScheduledTriggerSelectSchema
).openapi('ScheduledTrigger');

export const ScheduledTriggerApiInsertBaseSchema = createAgentScopedApiInsertSchema(
  ScheduledTriggerInsertSchemaBase
)
  .extend({ id: ResourceIdSchema.optional() })
  .openapi('ScheduledTriggerInsertBase');

export const ScheduledTriggerApiInsertSchema = ScheduledTriggerApiInsertBaseSchema.refine(
  (data) => data.cronExpression || data.runAt,
  {
    message: 'Either cronExpression or runAt must be provided',
  }
)
  .refine((data) => !(data.cronExpression && data.runAt), {
    message: 'Cannot specify both cronExpression and runAt',
  })
  .openapi('ScheduledTriggerCreate');

export const ScheduledTriggerApiUpdateSchema =
  ScheduledTriggerUpdateSchema.openapi('ScheduledTriggerUpdate');

export type ScheduledTrigger = z.infer<typeof ScheduledTriggerSelectSchema>;
export type ScheduledTriggerInsert = z.infer<typeof ScheduledTriggerInsertSchema>;
export type ScheduledTriggerUpdate = z.infer<typeof ScheduledTriggerUpdateSchema>;
export type ScheduledTriggerApiInsert = z.infer<typeof ScheduledTriggerApiInsertSchema>;
export type ScheduledTriggerApiSelect = z.infer<typeof ScheduledTriggerApiSelectSchema>;
export type ScheduledTriggerApiUpdate = z.infer<typeof ScheduledTriggerApiUpdateSchema>;

//scheduled workflows
export const ScheduledWorkflowSelectSchema = createSelectSchema(scheduledWorkflows);

const ScheduledWorkflowInsertSchemaBase = createInsertSchema(scheduledWorkflows, {
  id: () => ResourceIdSchema,
  name: () => z.string().trim().min(1).describe('Scheduled workflow name'),
  description: () => z.string().optional().describe('Scheduled workflow description'),
  workflowRunId: () =>
    z.string().nullable().optional().describe('Active workflow run ID for lifecycle management'),
  scheduledTriggerId: () => z.string().describe('The scheduled trigger this workflow belongs to'),
});

export const ScheduledWorkflowInsertSchema = ScheduledWorkflowInsertSchemaBase;

export const ScheduledWorkflowUpdateSchema = ScheduledWorkflowInsertSchemaBase.extend({
  scheduledTriggerId: z.string().optional(),
}).partial();

export const ScheduledWorkflowApiSelectSchema = createAgentScopedApiSchema(
  ScheduledWorkflowSelectSchema
).openapi('ScheduledWorkflow');

export const ScheduledWorkflowApiInsertSchema = createAgentScopedApiInsertSchema(
  ScheduledWorkflowInsertSchemaBase
)
  .extend({ id: ResourceIdSchema.optional() })
  .openapi('ScheduledWorkflowCreate');

export const ScheduledWorkflowApiUpdateSchema =
  ScheduledWorkflowUpdateSchema.openapi('ScheduledWorkflowUpdate');

export type ScheduledWorkflow = z.infer<typeof ScheduledWorkflowSelectSchema>;
export type ScheduledWorkflowInsert = z.infer<typeof ScheduledWorkflowInsertSchema>;
export type ScheduledWorkflowUpdate = z.infer<typeof ScheduledWorkflowUpdateSchema>;

export const ScheduledTriggerInvocationStatusEnum = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const ScheduledTriggerInvocationSelectSchema = createSelectSchema(
  scheduledTriggerInvocations
).extend({
  resolvedPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  status: ScheduledTriggerInvocationStatusEnum,
});

export const ScheduledTriggerInvocationInsertSchema = createInsertSchema(
  scheduledTriggerInvocations,
  {
    id: () => ResourceIdSchema,
    scheduledTriggerId: () => ResourceIdSchema,
    status: () => ScheduledTriggerInvocationStatusEnum,
    scheduledFor: () => z.iso.datetime().describe('Scheduled execution time'),
    startedAt: () => z.iso.datetime().optional().describe('Actual start time'),
    completedAt: () => z.iso.datetime().optional().describe('Completion time'),
    resolvedPayload: () =>
      z
        .record(z.string(), z.unknown())
        .nullable()
        .optional()
        .describe('Resolved payload with variables'),
    conversationIds: () =>
      z.array(ResourceIdSchema).default([]).describe('Conversation IDs created during execution'),
    attemptNumber: () => z.number().int().min(1).default(1),
    idempotencyKey: () => z.string().describe('Idempotency key for deduplication'),
  }
);

export const ScheduledTriggerInvocationUpdateSchema =
  ScheduledTriggerInvocationInsertSchema.partial();

export const ScheduledTriggerInvocationApiSelectSchema = createAgentScopedApiSchema(
  ScheduledTriggerInvocationSelectSchema
).openapi('ScheduledTriggerInvocation');

export const ScheduledTriggerInvocationApiInsertSchema = createAgentScopedApiInsertSchema(
  ScheduledTriggerInvocationInsertSchema
)
  .extend({ id: ResourceIdSchema })
  .openapi('ScheduledTriggerInvocationCreate');

export const ScheduledTriggerInvocationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  ScheduledTriggerInvocationUpdateSchema
).openapi('ScheduledTriggerInvocationUpdate');

export type ScheduledTriggerInvocation = z.infer<typeof ScheduledTriggerInvocationSelectSchema>;
export type ScheduledTriggerInvocationInsert = z.infer<
  typeof ScheduledTriggerInvocationInsertSchema
>;
export type ScheduledTriggerInvocationUpdate = z.infer<
  typeof ScheduledTriggerInvocationUpdateSchema
>;
export type ScheduledTriggerInvocationStatus = z.infer<typeof ScheduledTriggerInvocationStatusEnum>;

export const TaskSelectSchema = createSelectSchema(tasks);
export const TaskInsertSchema = createInsertSchema(tasks).extend({
  id: ResourceIdSchema,
  conversationId: ResourceIdSchema.optional(),
  ref: ResolvedRefSchema,
});
export const TaskUpdateSchema = TaskInsertSchema.partial();

export const TaskApiSelectSchema = createApiSchema(TaskSelectSchema);
export const TaskApiInsertSchema = createApiInsertSchema(TaskInsertSchema);
export const TaskApiUpdateSchema = createApiUpdateSchema(TaskUpdateSchema);

export const TaskRelationSelectSchema = createSelectSchema(taskRelations);
export const TaskRelationInsertSchema = createInsertSchema(taskRelations).extend({
  id: ResourceIdSchema,
  parentTaskId: ResourceIdSchema,
  childTaskId: ResourceIdSchema,
});
export const TaskRelationUpdateSchema = TaskRelationInsertSchema.partial();

export const TaskRelationApiSelectSchema = createApiSchema(TaskRelationSelectSchema);
export const TaskRelationApiInsertSchema = createApiInsertSchema(TaskRelationInsertSchema);
export const TaskRelationApiUpdateSchema = createApiUpdateSchema(TaskRelationUpdateSchema);

const imageUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url) return true; // Optional field
      if (url.startsWith('data:image/')) {
        const base64Part = url.split(',')[1];
        if (!base64Part) return false;
        return base64Part.length < 1400000; // ~1MB limit
      }
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    {
      message: 'Image URL must be a valid HTTP(S) URL or a base64 data URL (max 1MB)',
    }
  );

export const McpTransportConfigSchema = z
  .object({
    type: z.enum(MCPTransportType),
    requestInit: z.record(z.string(), z.unknown()).optional(),
    eventSourceInit: z.record(z.string(), z.unknown()).optional(),
    reconnectionOptions: z.any().optional().openapi({
      type: 'object',
      description: 'Reconnection options for streamable HTTP transport',
    }),
    sessionId: z.string().optional(),
  })
  .openapi('McpTransportConfig');

export const ToolStatusSchema = z.enum(TOOL_STATUS_VALUES);

export const McpToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const ToolSelectSchema = createSelectSchema(tools);

export const ToolInsertSchema = createInsertSchema(tools)
  .extend({
    id: ResourceIdSchema,
    imageUrl: imageUrlSchema,
    config: z.object({
      type: z.literal('mcp'),
      mcp: z.object({
        server: z.object({
          url: z.url(),
        }),
        transport: z
          .object({
            type: z.enum(MCPTransportType),
            requestInit: z.record(z.string(), z.unknown()).optional(),
            eventSourceInit: z.record(z.string(), z.unknown()).optional(),
            reconnectionOptions: z.any().optional().openapi({
              type: 'object',
              description: 'Reconnection options for streamable HTTP transport',
            }),
            sessionId: z.string().optional(),
          })
          .optional(),
        activeTools: z.array(z.string()).optional(),
        toolOverrides: z
          .record(
            z.string(),
            z.object({
              displayName: z.string().optional(),
              description: z.string().optional(),
              schema: z.any().optional(),
              transformation: z
                .union([
                  z.string(), // JMESPath expression
                  z.record(z.string(), z.string()), // object mapping
                ])
                .optional(),
            })
          )
          .optional(),
        prompt: z.string().optional(),
      }),
    }),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export const ConversationSelectSchema = createSelectSchema(conversations);
export const ConversationInsertSchema = createInsertSchema(conversations).extend({
  id: ResourceIdSchema,
  contextConfigId: ResourceIdSchema.optional(),
  ref: ResolvedRefSchema,
});
export const ConversationUpdateSchema = ConversationInsertSchema.partial();

export const ConversationApiSelectSchema =
  createApiSchema(ConversationSelectSchema).openapi('Conversation');
export const ConversationApiInsertSchema =
  createApiInsertSchema(ConversationInsertSchema).openapi('ConversationCreate');
export const ConversationApiUpdateSchema =
  createApiUpdateSchema(ConversationUpdateSchema).openapi('ConversationUpdate');

export const MessageSelectSchema = createSelectSchema(messages);
export const MessageInsertSchema = createInsertSchema(messages).extend({
  id: ResourceIdSchema,
  conversationId: ResourceIdSchema,
  taskId: ResourceIdSchema.optional(),
});
export const MessageUpdateSchema = MessageInsertSchema.partial();

export const MessageApiSelectSchema = createApiSchema(MessageSelectSchema).openapi('Message');
export const MessageApiInsertSchema =
  createApiInsertSchema(MessageInsertSchema).openapi('MessageCreate');
export const MessageApiUpdateSchema =
  createApiUpdateSchema(MessageUpdateSchema).openapi('MessageUpdate');

export const ContextCacheSelectSchema = createSelectSchema(contextCache);
export const ContextCacheInsertSchema = createInsertSchema(contextCache).extend({
  ref: ResolvedRefSchema,
});
export const ContextCacheUpdateSchema = ContextCacheInsertSchema.partial();

export const ContextCacheApiSelectSchema = createApiSchema(ContextCacheSelectSchema);
export const ContextCacheApiInsertSchema = createApiInsertSchema(ContextCacheInsertSchema);
export const ContextCacheApiUpdateSchema = createApiUpdateSchema(ContextCacheUpdateSchema);

export const DatasetRunSelectSchema = createSelectSchema(datasetRun);
export const DatasetRunInsertSchema = createInsertSchema(datasetRun).extend({
  id: ResourceIdSchema,
});
export const DatasetRunUpdateSchema = DatasetRunInsertSchema.partial();

export const DatasetRunApiSelectSchema =
  createApiSchema(DatasetRunSelectSchema).openapi('DatasetRun');
export const DatasetRunApiInsertSchema = createApiInsertSchema(DatasetRunInsertSchema)
  .omit({ id: true })
  .openapi('DatasetRunCreate');
export const DatasetRunApiUpdateSchema = createApiUpdateSchema(DatasetRunUpdateSchema)
  .omit({ id: true })
  .openapi('DatasetRunUpdate');

export const DatasetRunConversationRelationSelectSchema = createSelectSchema(
  datasetRunConversationRelations
);
export const DatasetRunConversationRelationInsertSchema = createInsertSchema(
  datasetRunConversationRelations
).extend({
  id: ResourceIdSchema,
});
export const DatasetRunConversationRelationUpdateSchema =
  DatasetRunConversationRelationInsertSchema.partial();

export const DatasetRunConversationRelationApiSelectSchema = createApiSchema(
  DatasetRunConversationRelationSelectSchema
).openapi('DatasetRunConversationRelation');
export const DatasetRunConversationRelationApiInsertSchema = createApiInsertSchema(
  DatasetRunConversationRelationInsertSchema
)
  .omit({ id: true })
  .openapi('DatasetRunConversationRelationCreate');
export const DatasetRunConversationRelationApiUpdateSchema = createApiUpdateSchema(
  DatasetRunConversationRelationUpdateSchema
)
  .omit({ id: true })
  .openapi('DatasetRunConversationRelationUpdate');

export const EvaluationResultSelectSchema = createSelectSchema(evaluationResult);
export const EvaluationResultInsertSchema = createInsertSchema(evaluationResult).extend({
  id: ResourceIdSchema,
});
export const EvaluationResultUpdateSchema = EvaluationResultInsertSchema.partial();

export const EvaluationResultApiSelectSchema = createApiSchema(
  EvaluationResultSelectSchema
).openapi('EvaluationResult');
export const EvaluationResultApiInsertSchema = createApiInsertSchema(EvaluationResultInsertSchema)
  .omit({ id: true })
  .openapi('EvaluationResultCreate');
export const EvaluationResultApiUpdateSchema = createApiUpdateSchema(EvaluationResultUpdateSchema)
  .omit({ id: true })
  .openapi('EvaluationResultUpdate');

export const EvaluationRunSelectSchema = createSelectSchema(evaluationRun);
export const EvaluationRunInsertSchema = createInsertSchema(evaluationRun).extend({
  id: ResourceIdSchema,
});
export const EvaluationRunUpdateSchema = EvaluationRunInsertSchema.partial();

export const EvaluationRunApiSelectSchema =
  createApiSchema(EvaluationRunSelectSchema).openapi('EvaluationRun');
export const EvaluationRunApiInsertSchema = createApiInsertSchema(EvaluationRunInsertSchema)
  .omit({ id: true })
  .openapi('EvaluationRunCreate');
export const EvaluationRunApiUpdateSchema = createApiUpdateSchema(EvaluationRunUpdateSchema)
  .omit({ id: true })
  .openapi('EvaluationRunUpdate');

export const EvaluationRunConfigSelectSchema = createSelectSchema(evaluationRunConfig);
export const EvaluationRunConfigInsertSchema = createInsertSchema(evaluationRunConfig).extend({
  id: ResourceIdSchema,
});
export const EvaluationRunConfigUpdateSchema = EvaluationRunConfigInsertSchema.partial();

export const EvaluationRunConfigApiSelectSchema = createApiSchema(
  EvaluationRunConfigSelectSchema
).openapi('EvaluationRunConfig');
export const EvaluationRunConfigApiInsertSchema = createApiInsertSchema(
  EvaluationRunConfigInsertSchema
)
  .omit({ id: true })
  .extend({
    suiteConfigIds: z.array(z.string()).min(1, 'At least one suite config is required'),
  })
  .openapi('EvaluationRunConfigCreate');
export const EvaluationRunConfigApiUpdateSchema = createApiUpdateSchema(
  EvaluationRunConfigUpdateSchema
)
  .omit({ id: true })
  .extend({
    suiteConfigIds: z.array(z.string()).optional(),
  })
  .openapi('EvaluationRunConfigUpdate');
export const EvaluationRunConfigWithSuiteConfigsApiSelectSchema =
  EvaluationRunConfigApiSelectSchema.extend({
    suiteConfigIds: z.array(z.string()),
  }).openapi('EvaluationRunConfigWithSuiteConfigs');

export const EvaluationJobConfigSelectSchema = createSelectSchema(evaluationJobConfig);
export const EvaluationJobConfigInsertSchema = createInsertSchema(evaluationJobConfig).extend({
  id: ResourceIdSchema,
});
export const EvaluationJobConfigUpdateSchema = EvaluationJobConfigInsertSchema.partial();

export const EvaluationJobConfigApiSelectSchema = createApiSchema(
  EvaluationJobConfigSelectSchema
).openapi('EvaluationJobConfig');
export const EvaluationJobConfigApiInsertSchema = createApiInsertSchema(
  EvaluationJobConfigInsertSchema
)
  .omit({ id: true })
  .extend({
    evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator is required'),
  })
  .openapi('EvaluationJobConfigCreate');
export const EvaluationJobConfigApiUpdateSchema = createApiUpdateSchema(
  EvaluationJobConfigUpdateSchema
)
  .omit({ id: true })
  .openapi('EvaluationJobConfigUpdate');

export const EvaluationSuiteConfigSelectSchema = createSelectSchema(evaluationSuiteConfig);
export const EvaluationSuiteConfigInsertSchema = createInsertSchema(evaluationSuiteConfig).extend({
  id: ResourceIdSchema,
});
export const EvaluationSuiteConfigUpdateSchema = EvaluationSuiteConfigInsertSchema.partial();

export const EvaluationSuiteConfigApiSelectSchema = createApiSchema(
  EvaluationSuiteConfigSelectSchema
).openapi('EvaluationSuiteConfig');
export const EvaluationSuiteConfigApiInsertSchema = createApiInsertSchema(
  EvaluationSuiteConfigInsertSchema
)
  .omit({ id: true })
  .extend({
    evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator is required'),
  })
  .openapi('EvaluationSuiteConfigCreate');
export const EvaluationSuiteConfigApiUpdateSchema = createApiUpdateSchema(
  EvaluationSuiteConfigUpdateSchema
)
  .omit({ id: true })
  .extend({
    evaluatorIds: z.array(z.string()).optional(),
  })
  .openapi('EvaluationSuiteConfigUpdate');

export const EvaluationRunConfigEvaluationSuiteConfigRelationSelectSchema = createSelectSchema(
  evaluationRunConfigEvaluationSuiteConfigRelations
);
export const EvaluationRunConfigEvaluationSuiteConfigRelationInsertSchema = createInsertSchema(
  evaluationRunConfigEvaluationSuiteConfigRelations
).extend({
  id: ResourceIdSchema,
});
export const EvaluationRunConfigEvaluationSuiteConfigRelationUpdateSchema =
  EvaluationRunConfigEvaluationSuiteConfigRelationInsertSchema.partial();

export const EvaluationRunConfigEvaluationSuiteConfigRelationApiSelectSchema = createApiSchema(
  EvaluationRunConfigEvaluationSuiteConfigRelationSelectSchema
).openapi('EvaluationRunConfigEvaluationSuiteConfigRelation');
export const EvaluationRunConfigEvaluationSuiteConfigRelationApiInsertSchema =
  createApiInsertSchema(EvaluationRunConfigEvaluationSuiteConfigRelationInsertSchema)
    .omit({ id: true })
    .openapi('EvaluationRunConfigEvaluationSuiteConfigRelationCreate');
export const EvaluationRunConfigEvaluationSuiteConfigRelationApiUpdateSchema =
  createApiUpdateSchema(EvaluationRunConfigEvaluationSuiteConfigRelationUpdateSchema)
    .omit({ id: true })
    .openapi('EvaluationRunConfigEvaluationSuiteConfigRelationUpdate');

export const EvaluationJobConfigEvaluatorRelationSelectSchema = createSelectSchema(
  evaluationJobConfigEvaluatorRelations
);
export const EvaluationJobConfigEvaluatorRelationInsertSchema = createInsertSchema(
  evaluationJobConfigEvaluatorRelations
).extend({
  id: ResourceIdSchema,
});
export const EvaluationJobConfigEvaluatorRelationUpdateSchema =
  EvaluationJobConfigEvaluatorRelationInsertSchema.partial();

export const EvaluationJobConfigEvaluatorRelationApiSelectSchema = createApiSchema(
  EvaluationJobConfigEvaluatorRelationSelectSchema
).openapi('EvaluationJobConfigEvaluatorRelation');
export const EvaluationJobConfigEvaluatorRelationApiInsertSchema = createApiInsertSchema(
  EvaluationJobConfigEvaluatorRelationInsertSchema
)
  .omit({ id: true })
  .openapi('EvaluationJobConfigEvaluatorRelationCreate');
export const EvaluationJobConfigEvaluatorRelationApiUpdateSchema = createApiUpdateSchema(
  EvaluationJobConfigEvaluatorRelationUpdateSchema
)
  .omit({ id: true })
  .openapi('EvaluationJobConfigEvaluatorRelationUpdate');

export const EvaluationSuiteConfigEvaluatorRelationSelectSchema = createSelectSchema(
  evaluationSuiteConfigEvaluatorRelations
);
export const EvaluationSuiteConfigEvaluatorRelationInsertSchema = createInsertSchema(
  evaluationSuiteConfigEvaluatorRelations
).extend({
  id: ResourceIdSchema,
});
export const EvaluationSuiteConfigEvaluatorRelationUpdateSchema =
  EvaluationSuiteConfigEvaluatorRelationInsertSchema.partial();

export const EvaluationSuiteConfigEvaluatorRelationApiSelectSchema = createApiSchema(
  EvaluationSuiteConfigEvaluatorRelationSelectSchema
).openapi('EvaluationSuiteConfigEvaluatorRelation');
export const EvaluationSuiteConfigEvaluatorRelationApiInsertSchema = createApiInsertSchema(
  EvaluationSuiteConfigEvaluatorRelationInsertSchema
)
  .omit({ id: true })
  .openapi('EvaluationSuiteConfigEvaluatorRelationCreate');
export const EvaluationSuiteConfigEvaluatorRelationApiUpdateSchema = createApiUpdateSchema(
  EvaluationSuiteConfigEvaluatorRelationUpdateSchema
)
  .omit({ id: true })
  .openapi('EvaluationSuiteConfigEvaluatorRelationUpdate');

export const EvaluatorSelectSchema = createSelectSchema(evaluator);
export const EvaluatorInsertSchema = createInsertSchema(evaluator).extend({
  id: ResourceIdSchema,
});
export const EvaluatorUpdateSchema = EvaluatorInsertSchema.partial();

export const EvaluatorApiSelectSchema = createApiSchema(EvaluatorSelectSchema).openapi('Evaluator');
export const EvaluatorApiInsertSchema = createApiInsertSchema(EvaluatorInsertSchema)
  .omit({ id: true })
  .openapi('EvaluatorCreate');
export const EvaluatorApiUpdateSchema = createApiUpdateSchema(EvaluatorUpdateSchema)
  .omit({ id: true })
  .openapi('EvaluatorUpdate');

export const DatasetSelectSchema = createSelectSchema(dataset);
export const DatasetInsertSchema = createInsertSchema(dataset).extend({
  id: ResourceIdSchema,
});
export const DatasetUpdateSchema = DatasetInsertSchema.partial();

export const DatasetApiSelectSchema = createApiSchema(DatasetSelectSchema).openapi('Dataset');
export const DatasetApiInsertSchema = createApiInsertSchema(DatasetInsertSchema)
  .omit({ id: true })
  .openapi('DatasetCreate');
export const DatasetApiUpdateSchema = createApiUpdateSchema(DatasetUpdateSchema)
  .omit({ id: true })
  .openapi('DatasetUpdate');

export const DatasetItemSelectSchema = createSelectSchema(datasetItem);
export const DatasetItemInsertSchema = createInsertSchema(datasetItem).extend({
  id: ResourceIdSchema,
});
export const DatasetItemUpdateSchema = DatasetItemInsertSchema.partial();

export const DatasetItemApiSelectSchema =
  createApiSchema(DatasetItemSelectSchema).openapi('DatasetItem');
export const DatasetItemApiInsertSchema = createApiInsertSchema(DatasetItemInsertSchema)
  .omit({ id: true, datasetId: true })
  .openapi('DatasetItemCreate');
export const DatasetItemApiUpdateSchema = createApiUpdateSchema(DatasetItemUpdateSchema)
  .omit({ id: true, datasetId: true })
  .openapi('DatasetItemUpdate');

export const DatasetRunItemSchema = DatasetItemApiSelectSchema.pick({
  id: true,
  input: true,
  expectedOutput: true,
  simulationAgent: true,
})
  .partial()
  .extend({ agentId: z.string() })
  .openapi('DatasetRunItem');

export const TriggerDatasetRunSchema = z
  .object({
    datasetRunId: z.string(),
    items: z.array(DatasetRunItemSchema),
    evaluatorIds: z.array(z.string()).optional(),
    evaluationRunId: z.string().optional(),
  })
  .openapi('TriggerDatasetRun');

export const TriggerConversationEvaluationSchema = z
  .object({
    conversationId: z.string(),
  })
  .openapi('TriggerConversationEvaluation');

export const TriggerBatchConversationEvaluationSchema = z
  .object({
    conversations: z.array(
      z.object({
        conversationId: z.string(),
        evaluatorIds: z.array(z.string()),
        evaluationRunId: z.string(),
      })
    ),
  })
  .openapi('TriggerBatchConversationEvaluation');

export const EvaluationJobFilterCriteriaSchema = z
  .object({
    datasetRunIds: z.array(z.string()).optional(),
    conversationIds: z.array(z.string()).optional(),
    dateRange: z
      .object({
        startDate: z.string(),
        endDate: z.string(),
      })
      .optional(),
  })
  .openapi('EvaluationJobFilterCriteria');

export const TriggerEvaluationJobSchema = z
  .object({
    evaluationJobConfigId: z.string(),
    evaluatorIds: z.array(z.string()),
    jobFilters: EvaluationJobFilterCriteriaSchema.nullable().optional(),
  })
  .openapi('TriggerEvaluationJob');

export const DatasetRunConfigSelectSchema = createSelectSchema(datasetRunConfig);
export const DatasetRunConfigInsertSchema = createInsertSchema(datasetRunConfig).extend({
  id: ResourceIdSchema,
});
export const DatasetRunConfigUpdateSchema = DatasetRunConfigInsertSchema.partial();

export const DatasetRunConfigApiSelectSchema = createApiSchema(
  DatasetRunConfigSelectSchema
).openapi('DatasetRunConfig');
export const DatasetRunConfigApiInsertSchema = createApiInsertSchema(DatasetRunConfigInsertSchema)
  .omit({ id: true })
  .openapi('DatasetRunConfigCreate');
export const DatasetRunConfigApiUpdateSchema = createApiUpdateSchema(DatasetRunConfigUpdateSchema)
  .omit({ id: true })
  .openapi('DatasetRunConfigUpdate');

export const DatasetRunConfigAgentRelationSelectSchema = createSelectSchema(
  datasetRunConfigAgentRelations
);
export const DatasetRunConfigAgentRelationInsertSchema = createInsertSchema(
  datasetRunConfigAgentRelations
).extend({
  id: ResourceIdSchema,
});
export const DatasetRunConfigAgentRelationUpdateSchema =
  DatasetRunConfigAgentRelationInsertSchema.partial();

const SkillIndexSchema = z.int().min(0);

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .trim()
    .nonempty()
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      'May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)'
    )
    .refine(
      (v) => !(v.startsWith('-') || v.endsWith('-')),
      'Must not start or end with a hyphen (-)'
    )
    .refine((v) => !v.includes('--'), 'Must not contain consecutive hyphens (--)')
    .refine((v) => v !== 'new', 'Must not use a reserved name "new"'),
  description: z.string().trim().nonempty().max(1024),
  metadata: StringRecordSchema.nullish().default(null),
});
export const SkillSelectSchema = createSelectSchema(skills).extend({
  metadata: StringRecordSchema.nullable(),
});
export const SkillInsertSchema = createInsertSchema(skills)
  .extend({
    ...SkillFrontmatterSchema.shape,
    content: z.string().trim().nonempty(),
  })
  .omit({
    // We set id under the hood as skill.name
    id: true,
    createdAt: true,
    updatedAt: true,
  });
export const SkillUpdateSchema = SkillInsertSchema.partial().omit({
  // Name is persistent
  name: true,
});

export const SkillApiSelectSchema = createApiSchema(SkillSelectSchema).openapi('Skill');
export const SkillApiInsertSchema = createApiInsertSchema(SkillInsertSchema).openapi('SkillCreate');
export const SkillApiUpdateSchema = createApiUpdateSchema(SkillUpdateSchema).openapi('SkillUpdate');

export const DataComponentSelectSchema = createSelectSchema(dataComponents);
export const DataComponentInsertSchema = createInsertSchema(dataComponents)
  .extend({
    id: ResourceIdSchema,
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export const DataComponentUpdateSchema = DataComponentInsertSchema.partial();

export const DataComponentApiSelectSchema =
  createApiSchema(DataComponentSelectSchema).openapi('DataComponent');
export const DataComponentApiInsertSchema = createApiInsertSchema(DataComponentInsertSchema)
  .extend(DataComponentExtendSchema)
  .openapi('DataComponentCreate');
export const DataComponentApiUpdateSchema = createApiUpdateSchema(DataComponentUpdateSchema)
  .extend(DataComponentExtendSchema)
  .openapi('DataComponentUpdate');

export const SubAgentDataComponentSelectSchema = createSelectSchema(subAgentDataComponents);
export const SubAgentDataComponentInsertSchema = createInsertSchema(subAgentDataComponents);
export const SubAgentDataComponentUpdateSchema = SubAgentDataComponentInsertSchema.partial();

export const SubAgentDataComponentApiSelectSchema = createAgentScopedApiSchema(
  SubAgentDataComponentSelectSchema
);
export const SubAgentDataComponentApiInsertSchema = SubAgentDataComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const SubAgentDataComponentApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentDataComponentUpdateSchema
);

export const ArtifactComponentSelectSchema = createSelectSchema(artifactComponents);
export const ArtifactComponentInsertSchema = createInsertSchema(artifactComponents).extend({
  id: ResourceIdSchema,
});
export const ArtifactComponentUpdateSchema = ArtifactComponentInsertSchema.partial();

export const ArtifactComponentApiSelectSchema = createApiSchema(
  ArtifactComponentSelectSchema
).openapi('ArtifactComponent');
export const ArtifactComponentApiInsertSchema = ArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
})
  .extend(ArtifactComponentExtendSchema)
  .openapi('ArtifactComponentCreate');
export const ArtifactComponentApiUpdateSchema = createApiUpdateSchema(
  ArtifactComponentUpdateSchema
).openapi('ArtifactComponentUpdate');

export const SubAgentArtifactComponentSelectSchema = createSelectSchema(subAgentArtifactComponents);
export const SubAgentArtifactComponentInsertSchema = createInsertSchema(
  subAgentArtifactComponents
).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  artifactComponentId: ResourceIdSchema,
});
export const SubAgentArtifactComponentUpdateSchema =
  SubAgentArtifactComponentInsertSchema.partial();

export const SubAgentArtifactComponentApiSelectSchema = createAgentScopedApiSchema(
  SubAgentArtifactComponentSelectSchema
);
export const SubAgentArtifactComponentApiInsertSchema = SubAgentArtifactComponentInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
});
export const SubAgentArtifactComponentApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentArtifactComponentUpdateSchema
);

export const SubAgentSkillSelectSchema = createSelectSchema(subAgentSkills).extend({
  index: SkillIndexSchema,
});
export const SubAgentSkillInsertSchema = createInsertSchema(subAgentSkills).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  skillId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean().optional().default(false),
});
export const SubAgentSkillUpdateSchema = SubAgentSkillInsertSchema.partial();

export const SubAgentSkillApiSelectSchema =
  createAgentScopedApiSchema(SubAgentSkillSelectSchema).openapi('SubAgentSkill');
export const SubAgentSkillApiInsertSchema = SubAgentSkillInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
  updatedAt: true,
}).openapi('SubAgentSkillCreate');
export const SubAgentSkillApiUpdateSchema =
  createAgentScopedApiUpdateSchema(SubAgentSkillUpdateSchema).openapi('SubAgentSkillUpdate');

export const SubAgentSkillWithIndexSchema = SkillApiSelectSchema.extend({
  subAgentSkillId: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean(),
}).openapi('SubAgentSkillWithIndex');

export const ExternalAgentSelectSchema = createSelectSchema(externalAgents).extend({
  credentialReferenceId: z.string().nullable().optional(),
});
export const ExternalAgentInsertSchema = createInsertSchema(externalAgents)
  .extend({
    id: ResourceIdSchema,
    name: NameSchema,
    description: DescriptionSchema,
    baseUrl: z.url(),
    credentialReferenceId: z.string().trim().nonempty().max(256).nullish(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ExternalAgentUpdateSchema = ExternalAgentInsertSchema.partial();

export const ExternalAgentApiSelectSchema =
  createApiSchema(ExternalAgentSelectSchema).openapi('ExternalAgent');
export const ExternalAgentApiInsertSchema =
  createApiInsertSchema(ExternalAgentInsertSchema).openapi('ExternalAgentCreate');
export const ExternalAgentApiUpdateSchema =
  createApiUpdateSchema(ExternalAgentUpdateSchema).openapi('ExternalAgentUpdate');

export const AllAgentSchema = z.discriminatedUnion('type', [
  SubAgentApiSelectSchema.extend({ type: z.literal('internal') }),
  ExternalAgentApiSelectSchema.extend({ type: z.literal('external') }),
]);

export const ApiKeySelectSchema = createSelectSchema(apiKeys);

export const ApiKeyInsertSchema = createInsertSchema(apiKeys).extend({
  id: ResourceIdSchema,
  agentId: ResourceIdSchema,
  name: z.string().trim().nonempty('Please enter a name.').max(256),
});

export const ApiKeyUpdateSchema = ApiKeyInsertSchema.partial().omit({
  tenantId: true,
  projectId: true,
  id: true,
  publicId: true,
  keyHash: true,
  keyPrefix: true,
  createdAt: true,
});

export const ApiKeyApiSelectSchema = ApiKeySelectSchema.omit({
  tenantId: true,
  projectId: true,
  keyHash: true, // Never expose the hash
}).openapi('ApiKey');

export const ApiKeyApiCreationResponseSchema = z.object({
  data: z.object({
    apiKey: ApiKeyApiSelectSchema,
    key: z.string().describe('The full API key (shown only once)'),
  }),
});

export const ApiKeyApiInsertSchema = ApiKeyInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true, // Auto-generated
  publicId: true, // Auto-generated
  keyHash: true, // Auto-generated
  keyPrefix: true, // Auto-generated
  lastUsedAt: true, // Not set on creation
}).openapi('ApiKeyCreate');

export const ApiKeyApiUpdateSchema = ApiKeyUpdateSchema.openapi('ApiKeyUpdate');

export const CredentialReferenceSelectSchema = createSelectSchema(credentialReferences);

export const CredentialReferenceInsertSchema = createInsertSchema(credentialReferences)
  .extend({
    id: ResourceIdSchema,
    type: z.string(),
    credentialStoreId: ResourceIdSchema,
    retrievalParams: z.record(z.string(), z.unknown()).nullish(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export const CredentialReferenceUpdateSchema = CredentialReferenceInsertSchema.partial();

export const CredentialReferenceApiSelectSchema = createApiSchema(CredentialReferenceSelectSchema)
  .extend({
    type: z.enum(CredentialStoreType),
    tools: z.array(ToolSelectSchema).optional(),
    externalAgents: z.array(ExternalAgentSelectSchema).optional(),
  })
  .openapi('CredentialReference');
export const CredentialReferenceApiInsertSchema = createApiInsertSchema(
  CredentialReferenceInsertSchema
)
  .extend({
    type: z.enum(CredentialStoreType),
  })
  .openapi('CredentialReferenceCreate');
export const CredentialReferenceApiUpdateSchema = createApiUpdateSchema(
  CredentialReferenceUpdateSchema
)
  .extend({
    type: z.enum(CredentialStoreType).optional(),
  })
  .openapi('CredentialReferenceUpdate');

export const CredentialStoreSchema = z
  .object({
    id: z.string().describe('Unique identifier of the credential store'),
    type: z.enum(CredentialStoreType),
    available: z.boolean().describe('Whether the store is functional and ready to use'),
    reason: z.string().nullable().describe('Reason why store is not available, if applicable'),
  })
  .openapi('CredentialStore');

export const CredentialStoreListResponseSchema = z
  .object({
    data: z.array(CredentialStoreSchema).describe('List of credential stores'),
  })
  .openapi('CredentialStoreListResponse');

export const CreateCredentialInStoreRequestSchema = z
  .object({
    key: z.string().describe('The credential key'),
    value: z.string().describe('The credential value'),
    metadata: z
      .record(z.string(), z.string())
      .nullish()
      .describe('The metadata for the credential'),
  })
  .openapi('CreateCredentialInStoreRequest');

export const CreateCredentialInStoreResponseSchema = z
  .object({
    data: z.object({
      key: z.string().describe('The credential key'),
      storeId: z.string().describe('The store ID where credential was created'),
      createdAt: z.string().describe('ISO timestamp of creation'),
    }),
  })
  .openapi('CreateCredentialInStoreResponse');

export const RelatedAgentInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
  })
  .openapi('RelatedAgentInfo');

export const ComponentAssociationSchema = z
  .object({
    subAgentId: z.string(),
    createdAt: z.string(),
  })
  .openapi('ComponentAssociation');

export const OAuthLoginQuerySchema = z
  .object({
    tenantId: z.string().min(1, 'Tenant ID is required'),
    projectId: z.string().min(1, 'Project ID is required'),
    toolId: z.string().min(1, 'Tool ID is required'),
  })
  .openapi('OAuthLoginQuery');

export const OAuthCallbackQuerySchema = z
  .object({
    code: z.string().min(1, 'Authorization code is required'),
    state: z.string().min(1, 'State parameter is required'),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .openapi('OAuthCallbackQuery');

export const McpToolSchema = ToolInsertSchema.extend({
  imageUrl: imageUrlSchema,
  availableTools: z.array(McpToolDefinitionSchema).optional(),
  status: ToolStatusSchema.default('unknown'),
  version: z.string().optional(),
  expiresAt: z.string().optional(),
  createdBy: z.string().optional(),
  relationshipId: z.string().optional(),
}).openapi('McpTool');

export const MCPToolConfigSchema = McpToolSchema.omit({
  config: true,
  tenantId: true,
  projectId: true,
  status: true,
  version: true,
  credentialReferenceId: true,
}).extend({
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
  description: z.string().optional(),
  serverUrl: z.url(),
  activeTools: z.array(z.string()).optional(),
  mcpType: z.enum(MCPServerType).optional(),
  transport: McpTransportConfigSchema.optional(),
  credential: CredentialReferenceApiInsertSchema.optional(),
  toolOverrides: z
    .record(
      z.string(),
      z.object({
        displayName: z.string().optional(),
        description: z.string().optional(),
        schema: z.any().optional(),
        transformation: z
          .union([
            z.string(), // JMESPath expression
            z.record(z.string(), z.string()), // object mapping
          ])
          .optional(),
      })
    )
    .optional(),
  prompt: z.string().optional(),
});

export const ToolUpdateSchema = ToolInsertSchema.partial();

export const ToolApiSelectSchema = createApiSchema(ToolSelectSchema).openapi('Tool');
export const ToolApiInsertSchema = createApiInsertSchema(ToolInsertSchema).openapi('ToolCreate');
export const ToolApiUpdateSchema = createApiUpdateSchema(ToolUpdateSchema).openapi('ToolUpdate');

export const FunctionToolSelectSchema = createSelectSchema(functionTools);

export const FunctionToolInsertSchema = createInsertSchema(functionTools)
  .extend({
    id: ResourceIdSchema,
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export const FunctionToolUpdateSchema = FunctionToolInsertSchema.partial();

export const FunctionToolApiSelectSchema = createApiSchema(FunctionToolSelectSchema)
  .extend({
    relationshipId: z.string().optional(),
  })
  .openapi('FunctionTool');
export const FunctionToolApiInsertSchema =
  createAgentScopedApiInsertSchema(FunctionToolInsertSchema).openapi('FunctionToolCreate');
export const FunctionToolApiUpdateSchema =
  createApiUpdateSchema(FunctionToolUpdateSchema).openapi('FunctionToolUpdate');

export const SubAgentFunctionToolRelationSelectSchema = createSelectSchema(
  subAgentFunctionToolRelations
);
export const SubAgentFunctionToolRelationInsertSchema = createInsertSchema(
  subAgentFunctionToolRelations
).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  functionToolId: ResourceIdSchema,
});

export const SubAgentFunctionToolRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentFunctionToolRelationSelectSchema
).openapi('SubAgentFunctionToolRelation');
export const SubAgentFunctionToolRelationApiInsertSchema =
  SubAgentFunctionToolRelationInsertSchema.omit({
    tenantId: true,
    projectId: true,
    agentId: true,
    id: true,
    createdAt: true,
    updatedAt: true,
  }).openapi('SubAgentFunctionToolRelationCreate');

export const FunctionSelectSchema = createSelectSchema(functions);
export const FunctionInsertSchema = createInsertSchema(functions).extend({
  id: ResourceIdSchema,
});
export const FunctionUpdateSchema = FunctionInsertSchema.partial();

export const FunctionApiSelectSchema = createApiSchema(FunctionSelectSchema).openapi('Function');

const validateExecuteCode = (val: string, ctx: z.RefinementCtx) => {
  try {
    // Workaround for anonymous function because it’s not valid JavaScript grammar.
    // Babel (and every JS parser) rejects it.
    const isAnonymousFunction = /^(async\s+)?function(\s+)?\(/.test(val);
    if (isAnonymousFunction) {
      val = `(${val})`;
    }
    const ast = parse(val, { sourceType: 'module' });
    const { body } = ast.program;
    for (const node of body) {
      if (node.type === 'ExportDefaultDeclaration') {
        throw SyntaxError(
          'Export default declarations are not supported. Provide a single function instead.'
        );
      }
      if (node.type === 'ExportNamedDeclaration') {
        throw SyntaxError(
          'Export declarations are not supported. Provide a single function instead.'
        );
      }
    }
    const functionsCount = body.filter((node) => {
      if (node.type === 'FunctionDeclaration') {
        return true;
      }
      if (node.type === 'ExpressionStatement') {
        return (
          node.expression.type ===
          (isAnonymousFunction ? 'FunctionExpression' : 'ArrowFunctionExpression')
        );
      }
      return false;
    }).length;

    if (!functionsCount) {
      throw new SyntaxError('Must contain exactly one function.');
    }
    if (functionsCount > 1) {
      throw new SyntaxError(`Must contain exactly one function (found ${functionsCount}).`);
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : JSON.stringify(error);
    if (message.startsWith("'return' outside of function. (")) {
      message = 'Top-level return is not allowed.';
    } else if (message.startsWith('Unexpected token, expected "')) {
      message = 'TypeScript syntax is not supported. Use plain JavaScript.';
    } else if (
      message.startsWith(
        'This experimental syntax requires enabling one of the following parser plugin(s): "jsx", "flow", "typescript". ('
      )
    ) {
      message = 'JSX syntax is not supported. Use plain JavaScript.';
    }
    ctx.addIssue({
      code: 'custom',
      message,
      input: val,
    });
  }
};

export const FunctionApiInsertSchema = createApiInsertSchema(FunctionInsertSchema)
  .extend({
    executeCode: z.string().trim().nonempty().superRefine(validateExecuteCode),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .openapi('FunctionCreate');
export const FunctionApiUpdateSchema =
  createApiUpdateSchema(FunctionUpdateSchema).openapi('FunctionUpdate');

// Zod schemas for validation
export const FetchConfigSchema = z
  .object({
    url: z.string().min(1, 'URL is required'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
    transform: z.string().optional(), // JSONPath or JS transform function
    requiredToFetch: z
      .array(z.string())
      .optional()
      .describe(
        'Template variables that must resolve to non-empty values for the fetch to execute. ' +
          'If any variable cannot be resolved or resolves to an empty string, the fetch is skipped (not errored). ' +
          'Use this for optional context fetches that depend on request headers. ' +
          'Example: ["{{headers.x-user-id}}", "{{headers.x-api-key}}"]'
      ),
    timeout: z
      .number()
      .min(0)
      .optional()
      .default(CONTEXT_FETCHER_HTTP_TIMEOUT_MS_DEFAULT)
      .optional(),
  })
  .openapi('FetchConfig');

export const FetchDefinitionSchema = z
  .object({
    id: z.string().min(1, 'Fetch definition ID is required'),
    name: z.string().optional(),
    trigger: z.enum(['initialization', 'invocation']),
    fetchConfig: FetchConfigSchema,
    responseSchema: z.any().optional(), // JSON Schema for validating HTTP response
    defaultValue: z.any().optional().openapi({
      description: 'Default value if fetch fails',
    }),
    credential: CredentialReferenceApiInsertSchema.optional(),
  })
  .openapi('FetchDefinition');

export const ContextConfigSelectSchema = createSelectSchema(contextConfigs).extend({
  headersSchema: z.any().optional().openapi({
    type: 'object',
    description: 'JSON Schema for validating request headers',
  }),
});
export const ContextConfigInsertSchema = createInsertSchema(contextConfigs)
  .extend({
    id: ResourceIdSchema.optional(),
    headersSchema: z.any().nullable().optional().openapi({
      type: 'object',
      description: 'JSON Schema for validating request headers',
    }),
    contextVariables: z.any().nullable().optional().openapi({
      type: 'object',
      description: 'Context variables configuration with fetch definitions',
    }),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ContextConfigUpdateSchema = ContextConfigInsertSchema.partial();

export const ContextConfigApiSelectSchema = createApiSchema(ContextConfigSelectSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfig');
export const ContextConfigApiInsertSchema = createApiInsertSchema(ContextConfigInsertSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfigCreate');
export const ContextConfigApiUpdateSchema = createApiUpdateSchema(ContextConfigUpdateSchema)
  .omit({
    agentId: true,
  })
  .openapi('ContextConfigUpdate');

export const SubAgentToolRelationSelectSchema = createSelectSchema(subAgentToolRelations);
export const SubAgentToolRelationInsertSchema = createInsertSchema(subAgentToolRelations).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  toolId: ResourceIdSchema,
  selectedTools: z.array(z.string()).nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
  toolPolicies: z.record(z.string(), z.object({ needsApproval: z.boolean().optional() })).nullish(),
});

export const SubAgentToolRelationUpdateSchema = SubAgentToolRelationInsertSchema.partial();

export const SubAgentToolRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentToolRelationSelectSchema
).openapi('SubAgentToolRelation');
export const SubAgentToolRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentToolRelationInsertSchema
).openapi('SubAgentToolRelationCreate');
export const SubAgentToolRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentToolRelationUpdateSchema
).openapi('SubAgentToolRelationUpdate');

// Sub-Agent External Agent Relation Schemas
export const SubAgentExternalAgentRelationSelectSchema = createSelectSchema(
  subAgentExternalAgentRelations
);
export const SubAgentExternalAgentRelationInsertSchema = createInsertSchema(
  subAgentExternalAgentRelations
).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  externalAgentId: ResourceIdSchema,
  headers: z.record(z.string(), z.string()).nullish(),
});

export const SubAgentExternalAgentRelationUpdateSchema =
  SubAgentExternalAgentRelationInsertSchema.partial();

export const SubAgentExternalAgentRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentExternalAgentRelationSelectSchema
).openapi('SubAgentExternalAgentRelation');
export const SubAgentExternalAgentRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentExternalAgentRelationInsertSchema
)
  .omit({ id: true, subAgentId: true })
  .openapi('SubAgentExternalAgentRelationCreate');
export const SubAgentExternalAgentRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentExternalAgentRelationUpdateSchema
).openapi('SubAgentExternalAgentRelationUpdate');

// Sub-Agent Team Agent Relation Schemas
export const SubAgentTeamAgentRelationSelectSchema = createSelectSchema(subAgentTeamAgentRelations);
export const SubAgentTeamAgentRelationInsertSchema = createInsertSchema(
  subAgentTeamAgentRelations
).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  targetAgentId: ResourceIdSchema,
  headers: z.record(z.string(), z.string()).nullish(),
});

export const SubAgentTeamAgentRelationUpdateSchema =
  SubAgentTeamAgentRelationInsertSchema.partial();

export const SubAgentTeamAgentRelationApiSelectSchema = createAgentScopedApiSchema(
  SubAgentTeamAgentRelationSelectSchema
).openapi('SubAgentTeamAgentRelation');
export const SubAgentTeamAgentRelationApiInsertSchema = createAgentScopedApiInsertSchema(
  SubAgentTeamAgentRelationInsertSchema
)
  .omit({ id: true, subAgentId: true })
  .openapi('SubAgentTeamAgentRelationCreate');
export const SubAgentTeamAgentRelationApiUpdateSchema = createAgentScopedApiUpdateSchema(
  SubAgentTeamAgentRelationUpdateSchema
).openapi('SubAgentTeamAgentRelationUpdate');

export const LedgerArtifactSelectSchema = createSelectSchema(ledgerArtifacts);
export const LedgerArtifactInsertSchema = createInsertSchema(ledgerArtifacts);
export const LedgerArtifactUpdateSchema = LedgerArtifactInsertSchema.partial();

export const LedgerArtifactApiSelectSchema = createApiSchema(LedgerArtifactSelectSchema);
export const LedgerArtifactApiInsertSchema = createApiInsertSchema(LedgerArtifactInsertSchema);
export const LedgerArtifactApiUpdateSchema = createApiUpdateSchema(LedgerArtifactUpdateSchema);

export const StatusComponentSchema = z
  .object({
    type: z.string(),
    description: z.string().optional(),
    detailsSchema: z
      .object({
        type: z.literal('object'),
        properties: z.record(z.string(), z.any()),
        required: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .openapi('StatusComponent');

export const StatusUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    numEvents: z.number().min(1).max(STATUS_UPDATE_MAX_NUM_EVENTS).optional(),
    timeInSeconds: z.number().min(1).max(STATUS_UPDATE_MAX_INTERVAL_SECONDS).optional(),
    prompt: z
      .string()
      .max(
        VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
        `Custom prompt cannot exceed ${VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS} characters`
      )
      .optional(),
    statusComponents: z.array(StatusComponentSchema).optional(),
  })
  .openapi('StatusUpdate');

export const CanUseItemSchema = z
  .object({
    agentToolRelationId: z.string().optional(),
    toolId: z.string(),
    toolSelection: z.array(z.string()).nullish(),
    headers: z.record(z.string(), z.string()).nullish(),
    toolPolicies: z
      .record(z.string(), z.object({ needsApproval: z.boolean().optional() }))
      .nullish(),
  })
  .openapi('CanUseItem');

export const canRelateToInternalSubAgentSchema = z
  .object({
    subAgentId: z.string(),
    subAgentSubAgentRelationId: z.string(),
  })
  .openapi('CanRelateToInternalSubAgent');

// INSERT schemas - relation ID is optional (will be assigned on creation)
export const canDelegateToExternalAgentInsertSchema = z
  .object({
    externalAgentId: z.string(),
    subAgentExternalAgentRelationId: z.string().optional(),
    headers: z.record(z.string(), z.string()).nullish(),
  })
  .openapi('CanDelegateToExternalAgentInsert');

export const canDelegateToTeamAgentInsertSchema = z
  .object({
    agentId: z.string(),
    subAgentTeamAgentRelationId: z.string().optional(),
    headers: z.record(z.string(), z.string()).nullish(),
  })
  .openapi('CanDelegateToTeamAgentInsert');

// SELECT schemas - relation ID is required (returned from database)
export const canDelegateToExternalAgentSchema = z
  .object({
    externalAgentId: z.string(),
    subAgentExternalAgentRelationId: z.string(),
    headers: z.record(z.string(), z.string()).nullish(),
  })
  .openapi('CanDelegateToExternalAgent');

export const canDelegateToTeamAgentSchema = z
  .object({
    agentId: z.string(),
    subAgentTeamAgentRelationId: z.string(),
    headers: z.record(z.string(), z.string()).nullish(),
  })
  .openapi('CanDelegateToTeamAgent');

export const TeamAgentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  })
  .openapi('TeamAgent');

export const FullAgentAgentInsertSchema = SubAgentApiInsertSchema.extend({
  type: z.literal('internal'),
  canUse: z.array(CanUseItemSchema), // All tools (both MCP and function tools)
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  skills: z
    .array(
      z.strictObject({
        id: ResourceIdSchema,
        index: SkillIndexSchema,
        alwaysLoaded: z.boolean().optional(),
      })
    )
    .optional(),
  canTransferTo: z.array(z.string()).optional(),
  prompt: z.string().trim().optional(),
  canDelegateTo: z
    .array(
      z.union([
        z.string(), // Internal subAgent ID
        canDelegateToExternalAgentInsertSchema, // External agent with headers (INSERT - relation ID optional)
        canDelegateToTeamAgentInsertSchema, // Team agent with headers (INSERT - relation ID optional)
      ])
    )
    .optional(),
  stopWhen: SubAgentStopWhenSchema.optional(),
}).openapi('FullAgentAgentInsert');

export const AgentWithinContextOfProjectSchema = AgentApiInsertSchema.extend({
  subAgents: z.record(z.string(), FullAgentAgentInsertSchema), // Lookup maps for UI to resolve canUse items
  tools: z.record(z.string(), ToolApiInsertSchema).optional(), // MCP tools (project-scoped)
  externalAgents: z.record(z.string(), ExternalAgentApiInsertSchema).optional(), // External agents (project-scoped)
  teamAgents: z.record(z.string(), TeamAgentSchema).optional(), // Team agents contain basic metadata for the agent to be delegated to
  functionTools: z.record(z.string(), FunctionToolApiInsertSchema).optional(), // Function tools (agent-scoped)
  functions: z.record(z.string(), FunctionApiInsertSchema).optional(), // Get function code for function tools
  triggers: z.record(z.string(), TriggerApiInsertSchema).optional(), // Webhook triggers (agent-scoped)
  scheduledTriggers: z.record(z.string(), ScheduledTriggerApiInsertBaseSchema).optional(), // Scheduled triggers (agent-scoped)
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  statusUpdates: z.optional(StatusUpdateSchema),
  models: ModelSchema.optional(),
  stopWhen: AgentStopWhenSchema.optional(),
  prompt: z
    .string()
    .max(
      VALIDATION_AGENT_PROMPT_MAX_CHARS,
      `Agent prompt cannot exceed ${VALIDATION_AGENT_PROMPT_MAX_CHARS} characters`
    )
    .optional(),
}).openapi('AgentWithinContextOfProject');

export const PaginationSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
    total: z.number(),
    pages: z.number(),
  })
  .openapi('Pagination');

export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export const SingleResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: itemSchema,
  });

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    details: z.any().optional().openapi({
      description: 'Additional error details',
    }),
  })
  .openapi('ErrorResponse');

export const ExistsResponseSchema = z
  .object({
    exists: z.boolean(),
  })
  .openapi('ExistsResponse');

export const RemovedResponseSchema = z
  .object({
    message: z.string(),
    removed: z.boolean(),
  })
  .openapi('RemovedResponse');

export const ProjectSelectSchema = registerFieldSchemas(
  createSelectSchema(projects).extend({
    models: ProjectModelSchema.nullable(),
    stopWhen: StopWhenSchema.nullable(),
  })
);
export const ProjectInsertSchema = createInsertSchema(projects)
  .extend({
    models: ProjectModelSchema,
    stopWhen: StopWhenSchema.optional(),
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });
export const ProjectUpdateSchema = ProjectInsertSchema.partial().omit({
  id: true,
  tenantId: true,
});

// Projects API schemas - only omit tenantId since projects table doesn't have projectId
export const ProjectApiSelectSchema = ProjectSelectSchema.omit({ tenantId: true }).openapi(
  'Project'
);
export const ProjectApiInsertSchema = ProjectInsertSchema.omit({ tenantId: true }).openapi(
  'ProjectCreate'
);
export const ProjectApiUpdateSchema = ProjectUpdateSchema.openapi('ProjectUpdate');

// Full Project Definition Schema - extends Project with agents and other nested resources
export const FullProjectDefinitionSchema = ProjectApiInsertSchema.extend({
  agents: z.record(z.string(), AgentWithinContextOfProjectSchema),
  tools: z.record(z.string(), ToolApiInsertSchema),
  functionTools: z.record(z.string(), FunctionToolApiInsertSchema).optional(),
  functions: z.record(z.string(), FunctionApiInsertSchema).optional(),
  skills: z.record(z.string(), SkillApiInsertSchema).optional(),
  dataComponents: z.record(z.string(), DataComponentApiInsertSchema).optional(),
  artifactComponents: z.record(z.string(), ArtifactComponentApiInsertSchema).optional(),
  externalAgents: z.record(z.string(), ExternalAgentApiInsertSchema).optional(),
  statusUpdates: z.optional(StatusUpdateSchema),
  credentialReferences: z.record(z.string(), CredentialReferenceApiInsertSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).openapi('FullProjectDefinition');

// ============================================================================
// Full Project SELECT Schemas - Used when reading data from the database
// These use nullable() instead of optional() to match database SELECT behavior
// ============================================================================

export const FullAgentSubAgentSelectSchema = SubAgentApiSelectSchema.extend({
  type: z.literal('internal'),
  canUse: z.array(CanUseItemSchema),
  dataComponents: z.array(z.string()).nullable(),
  artifactComponents: z.array(z.string()).nullable(),
  canTransferTo: z.array(z.string()).nullable(),
  prompt: z.string().nullable(),
  canDelegateTo: z
    .array(
      z.union([
        z.string(), // Internal subAgent ID
        canDelegateToExternalAgentSchema,
        canDelegateToTeamAgentSchema,
      ])
    )
    .nullable(),
}).openapi('FullAgentSubAgentSelect');

//This is a temporary schema. It is used to get the relation ids for internal sub-agent relations.
//Eventually this should be used everywhere instead of FullAgentSubAgentSelectSchema
export const FullAgentSubAgentSelectSchemaWithRelationIds = FullAgentSubAgentSelectSchema.extend({
  canTransferTo: z.array(canRelateToInternalSubAgentSchema).nullable(),
  canDelegateTo: z
    .array(
      z.union([
        canRelateToInternalSubAgentSchema,
        canDelegateToExternalAgentSchema,
        canDelegateToTeamAgentSchema,
      ])
    )
    .nullable(),
}).openapi('FullAgentSubAgentSelectWithRelationIds');

export const AgentWithinContextOfProjectSelectSchema = AgentApiSelectSchema.extend({
  subAgents: z.record(z.string(), FullAgentSubAgentSelectSchema),
  tools: z.record(z.string(), ToolApiSelectSchema).nullable(),
  externalAgents: z.record(z.string(), ExternalAgentApiSelectSchema).nullable(),
  teamAgents: z.record(z.string(), TeamAgentSchema).nullable(),
  functionTools: z.record(z.string(), FunctionToolApiSelectSchema).nullable(),
  functions: z.record(z.string(), FunctionApiSelectSchema).nullable(),
  scheduledTriggers: z.record(z.string(), ScheduledTriggerApiSelectSchema).nullable(),
  contextConfig: ContextConfigApiSelectSchema.nullable(),
  statusUpdates: StatusUpdateSchema.nullable(),
  models: ModelSchema.nullable(),
  stopWhen: AgentStopWhenSchema.nullable(),
  prompt: z.string().nullable(),
}).openapi('AgentWithinContextOfProjectSelect');

export const AgentWithinContextOfProjectSelectSchemaWithRelationIds =
  AgentWithinContextOfProjectSelectSchema.extend({
    subAgents: z.record(z.string(), FullAgentSubAgentSelectSchemaWithRelationIds),
  }).openapi('AgentWithinContextOfProjectSelectWithRelationIds');

export const FullProjectSelectSchema = ProjectApiSelectSchema.extend({
  agents: z.record(z.string(), AgentWithinContextOfProjectSelectSchema),
  tools: z.record(z.string(), ToolApiSelectSchema),
  functionTools: z.record(z.string(), FunctionToolApiSelectSchema).nullable(),
  functions: z.record(z.string(), FunctionApiSelectSchema).nullable(),
  dataComponents: z.record(z.string(), DataComponentApiSelectSchema).nullable(),
  artifactComponents: z.record(z.string(), ArtifactComponentApiSelectSchema).nullable(),
  externalAgents: z.record(z.string(), ExternalAgentApiSelectSchema).nullable(),
  statusUpdates: StatusUpdateSchema.nullable(),
  credentialReferences: z.record(z.string(), CredentialReferenceApiSelectSchema).nullable(),
}).openapi('FullProjectSelect');

export const FullProjectSelectSchemaWithRelationIds = FullProjectSelectSchema.extend({
  agents: z.record(z.string(), AgentWithinContextOfProjectSelectSchemaWithRelationIds),
}).openapi('FullProjectSelectWithRelationIds');

// Single item response wrappers
export const ProjectResponse = z
  .object({ data: ProjectApiSelectSchema })
  .openapi('ProjectResponse');
export const SubAgentResponse = z
  .object({ data: SubAgentApiSelectSchema })
  .openapi('SubAgentResponse');
export const AgentResponse = z.object({ data: AgentApiSelectSchema }).openapi('AgentResponse');
export const ExternalAgentResponse = z
  .object({ data: ExternalAgentApiSelectSchema })
  .openapi('ExternalAgentResponse');
export const ContextConfigResponse = z
  .object({ data: ContextConfigApiSelectSchema })
  .openapi('ContextConfigResponse');
export const ApiKeyResponse = z.object({ data: ApiKeyApiSelectSchema }).openapi('ApiKeyResponse');
export const CredentialReferenceResponse = z
  .object({ data: CredentialReferenceApiSelectSchema })
  .openapi('CredentialReferenceResponse');
export const FunctionResponse = z
  .object({ data: FunctionApiSelectSchema })
  .openapi('FunctionResponse');
export const FunctionToolResponse = z
  .object({ data: FunctionToolApiSelectSchema })
  .openapi('FunctionToolResponse');
export const SubAgentFunctionToolRelationResponse = z
  .object({ data: SubAgentFunctionToolRelationApiSelectSchema })
  .openapi('SubAgentFunctionToolRelationResponse');
export const DataComponentResponse = z
  .object({ data: DataComponentApiSelectSchema })
  .openapi('DataComponentResponse');
export const ArtifactComponentResponse = z
  .object({ data: ArtifactComponentApiSelectSchema })
  .openapi('ArtifactComponentResponse');
export const SubAgentRelationResponse = z
  .object({ data: SubAgentRelationApiSelectSchema })
  .openapi('SubAgentRelationResponse');
export const SubAgentToolRelationResponse = z
  .object({ data: SubAgentToolRelationApiSelectSchema })
  .openapi('SubAgentToolRelationResponse');
export const TriggerResponse = z
  .object({ data: TriggerApiSelectSchema })
  .openapi('TriggerResponse');
export const TriggerInvocationResponse = z
  .object({ data: TriggerInvocationApiSelectSchema })
  .openapi('TriggerInvocationResponse');

export const ProjectListResponse = z
  .object({
    data: z.array(ProjectApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ProjectListResponse');
export const SubAgentListResponse = z
  .object({
    data: z.array(SubAgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentListResponse');
export const AgentListResponse = z
  .object({
    data: z.array(AgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('AgentListResponse');
export const ExternalAgentListResponse = z
  .object({
    data: z.array(ExternalAgentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ExternalAgentListResponse');
export const ContextConfigListResponse = z
  .object({
    data: z.array(ContextConfigApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ContextConfigListResponse');
export const ApiKeyListResponse = z
  .object({
    data: z.array(ApiKeyApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ApiKeyListResponse');
export const CredentialReferenceListResponse = z
  .object({
    data: z.array(CredentialReferenceApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('CredentialReferenceListResponse');
export const FunctionListResponse = z
  .object({
    data: z.array(FunctionApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('FunctionListResponse');
export const FunctionToolListResponse = z
  .object({
    data: z.array(FunctionToolApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('FunctionToolListResponse');
export const SubAgentFunctionToolRelationListResponse = z
  .object({
    data: z.array(SubAgentFunctionToolRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentFunctionToolRelationListResponse');
export const SkillResponse = z.object({ data: SkillApiSelectSchema }).openapi('SkillResponse');
export const SkillListResponse = z
  .object({
    data: z.array(SkillApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SkillListResponse');
export const DataComponentListResponse = z
  .object({
    data: z.array(DataComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('DataComponentListResponse');
export const ArtifactComponentListResponse = z
  .object({
    data: z.array(ArtifactComponentApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ArtifactComponentListResponse');
export const SubAgentRelationListResponse = z
  .object({
    data: z.array(SubAgentRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentRelationListResponse');
export const SubAgentToolRelationListResponse = z
  .object({
    data: z.array(SubAgentToolRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentToolRelationListResponse');
export const TriggerListResponse = z
  .object({
    data: z.array(TriggerApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('TriggerListResponse');
export const TriggerInvocationListResponse = z
  .object({
    data: z.array(TriggerInvocationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('TriggerInvocationListResponse');
export const TriggerWithWebhookUrlResponse = z
  .object({
    data: TriggerWithWebhookUrlSchema,
  })
  .openapi('TriggerWithWebhookUrlResponse');
export const TriggerWithWebhookUrlListResponse = z
  .object({
    data: z.array(TriggerWithWebhookUrlSchema),
    pagination: PaginationSchema,
  })
  .openapi('TriggerWithWebhookUrlListResponse');

export const ScheduledTriggerWithRunInfoSchema = ScheduledTriggerApiSelectSchema.extend({
  lastRunAt: z.iso.datetime().nullable().describe('Timestamp of the last completed or failed run'),
  lastRunStatus: z.enum(['completed', 'failed']).nullable().describe('Status of the last run'),
  lastRunConversationIds: z.array(z.string()).describe('Conversation IDs from the last run'),
  nextRunAt: z.iso.datetime().nullable().describe('Timestamp of the next pending run'),
}).openapi('ScheduledTriggerWithRunInfo');

export type ScheduledTriggerWithRunInfo = z.infer<typeof ScheduledTriggerWithRunInfoSchema>;

export const ScheduledTriggerResponse = z
  .object({ data: ScheduledTriggerApiSelectSchema })
  .openapi('ScheduledTriggerResponse');
export const ScheduledTriggerListResponse = z
  .object({
    data: z.array(ScheduledTriggerApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ScheduledTriggerListResponse');
export const ScheduledTriggerWithRunInfoListResponse = z
  .object({
    data: z.array(ScheduledTriggerWithRunInfoSchema),
    pagination: PaginationSchema,
  })
  .openapi('ScheduledTriggerWithRunInfoListResponse');
export const ScheduledTriggerInvocationResponse = z
  .object({ data: ScheduledTriggerInvocationApiSelectSchema })
  .openapi('ScheduledTriggerInvocationResponse');
export const ScheduledTriggerInvocationListResponse = z
  .object({
    data: z.array(ScheduledTriggerInvocationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ScheduledTriggerInvocationListResponse');
export const ScheduledWorkflowResponse = z
  .object({ data: ScheduledWorkflowApiSelectSchema })
  .openapi('ScheduledWorkflowResponse');
export const ScheduledWorkflowListResponse = z
  .object({
    data: z.array(ScheduledWorkflowApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('ScheduledWorkflowListResponse');

export const SubAgentDataComponentResponse = z
  .object({ data: SubAgentDataComponentApiSelectSchema })
  .openapi('SubAgentDataComponentResponse');
export const SubAgentArtifactComponentResponse = z
  .object({ data: SubAgentArtifactComponentApiSelectSchema })
  .openapi('SubAgentArtifactComponentResponse');
export const SubAgentSkillResponse = z
  .object({ data: SubAgentSkillApiSelectSchema })
  .openapi('SubAgentSkillResponse');
export const SubAgentSkillWithIndexArrayResponse = z
  .object({ data: z.array(SubAgentSkillWithIndexSchema) })
  .openapi('SubAgentSkillWithIndexArrayResponse');

// Missing response schemas for factory function replacement
export const FullProjectDefinitionResponse = z
  .object({ data: FullProjectDefinitionSchema })
  .openapi('FullProjectDefinitionResponse');

export const FullProjectSelectResponse = z
  .object({ data: FullProjectSelectSchema })
  .openapi('FullProjectSelectResponse');

export const FullProjectSelectWithRelationIdsResponse = z
  .object({ data: FullProjectSelectSchemaWithRelationIds })
  .openapi('FullProjectSelectWithRelationIdsResponse');

export const AgentWithinContextOfProjectResponse = z
  .object({ data: AgentWithinContextOfProjectSchema })
  .openapi('AgentWithinContextOfProjectResponse');

export const AgentWithinContextOfProjectSelectResponse = z
  .object({ data: AgentWithinContextOfProjectSelectSchema })
  .openapi('AgentWithinContextOfProjectSelectResponse');

export const RelatedAgentInfoListResponse = z
  .object({
    data: z.array(RelatedAgentInfoSchema),
    pagination: PaginationSchema,
  })
  .openapi('RelatedAgentInfoListResponse');

export const ComponentAssociationListResponse = z
  .object({ data: z.array(ComponentAssociationSchema) })
  .openapi('ComponentAssociationListResponse');

export const McpToolResponse = z.object({ data: McpToolSchema }).openapi('McpToolResponse');

export const McpToolListResponse = z
  .object({
    data: z.array(McpToolSchema),
    pagination: PaginationSchema,
  })
  .openapi('McpToolListResponse');

export const SubAgentTeamAgentRelationResponse = z
  .object({ data: SubAgentTeamAgentRelationApiSelectSchema })
  .openapi('SubAgentTeamAgentRelationResponse');

export const SubAgentTeamAgentRelationListResponse = z
  .object({
    data: z.array(SubAgentTeamAgentRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentTeamAgentRelationListResponse');

export const SubAgentExternalAgentRelationResponse = z
  .object({ data: SubAgentExternalAgentRelationApiSelectSchema })
  .openapi('SubAgentExternalAgentRelationResponse');

export const SubAgentExternalAgentRelationListResponse = z
  .object({
    data: z.array(SubAgentExternalAgentRelationApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SubAgentExternalAgentRelationListResponse');

// Array response schemas (no pagination)
export const DataComponentArrayResponse = z
  .object({ data: z.array(DataComponentApiSelectSchema) })
  .openapi('DataComponentArrayResponse');

export const ArtifactComponentArrayResponse = z
  .object({ data: z.array(ArtifactComponentApiSelectSchema) })
  .openapi('ArtifactComponentArrayResponse');

export const HeadersScopeSchema = z.object({
  'x-inkeep-tenant-id': z.string().optional().openapi({
    description: 'Tenant identifier',
    example: 'tenant_123',
  }),
  'x-inkeep-project-id': z.string().optional().openapi({
    description: 'Project identifier',
    example: 'project_456',
  }),
  'x-inkeep-agent-id': z.string().optional().openapi({
    description: 'Agent identifier',
    example: 'agent_789',
  }),
});

const TenantId = z.string().openapi('TenantIdPathParam', {
  param: {
    name: 'tenantId',
    in: 'path',
  },
  description: 'Tenant identifier',
  example: 'tenant_123',
});

const ProjectId = z.string().openapi('ProjectIdPathParam', {
  param: {
    name: 'projectId',
    in: 'path',
  },
  description: 'Project identifier',
  example: 'project_456',
});

const AgentId = z.string().openapi('AgentIdPathParam', {
  param: {
    name: 'agentId',
    in: 'path',
  },
  description: 'Agent identifier',
  example: 'agent_789',
});

const SubAgentId = z.string().openapi('SubAgentIdPathParam', {
  param: {
    name: 'subAgentId',
    in: 'path',
  },
  description: 'Sub-agent identifier',
  example: 'sub_agent_123',
});

export const TenantParamsSchema = z.object({
  tenantId: TenantId,
});

export const TenantIdParamsSchema = TenantParamsSchema.extend({
  id: ResourceIdSchema,
});

export const TenantProjectParamsSchema = TenantParamsSchema.extend({
  projectId: ProjectId,
});

export const TenantProjectIdParamsSchema = TenantProjectParamsSchema.extend({
  id: ResourceIdSchema,
});

export const TenantProjectAgentParamsSchema = TenantProjectParamsSchema.extend({
  agentId: AgentId,
});

export const TenantProjectAgentIdParamsSchema = TenantProjectAgentParamsSchema.extend({
  id: ResourceIdSchema,
});

export const TenantProjectAgentSubAgentParamsSchema = TenantProjectAgentParamsSchema.extend({
  subAgentId: SubAgentId,
});

export const TenantProjectAgentSubAgentIdParamsSchema =
  TenantProjectAgentSubAgentParamsSchema.extend({
    id: ResourceIdSchema,
  });

export const RefQueryParamSchema = z.object({
  ref: z.string().optional().describe('Branch name, tag name, or commit hash to query from'),
});

export const PaginationQueryParamsSchema = z
  .object({
    page: pageNumber,
    limit: limitNumber,
  })
  .openapi('PaginationQueryParams');

export const DateTimeFilterQueryParamsSchema = z.object({
  from: z.iso.datetime().optional().describe('Start date for filtering (ISO8601)'),
  to: z.iso.datetime().optional().describe('End date for filtering (ISO8601)'),
});

export const PrebuiltMCPServerSchema = z.object({
  id: z.string().describe('Unique identifier for the MCP server'),
  name: z.string().describe('Display name of the MCP server'),
  url: z.url().describe('URL endpoint for the MCP server'),
  transport: z.enum(MCPTransportType).describe('Transport protocol type'),
  imageUrl: z.url().optional().describe('Logo/icon URL for the MCP server'),
  isOpen: z
    .boolean()
    .optional()
    .describe("Whether the MCP server is open (doesn't require authentication)"),
  category: z
    .string()
    .optional()
    .describe('Category of the MCP server (e.g., communication, project_management)'),
  description: z.string().optional().describe('Brief description of what the MCP server does'),
  thirdPartyConnectAccountUrl: z
    .url()
    .optional()
    .describe('URL to connect to the third party account'),
});

export const MCPCatalogListResponse = z
  .object({
    data: z.array(PrebuiltMCPServerSchema),
  })
  .openapi('MCPCatalogListResponse');

export const ThirdPartyMCPServerResponse = z
  .object({
    data: PrebuiltMCPServerSchema.nullable(),
  })
  .openapi('ThirdPartyMCPServerResponse');
export const PaginationWithRefQueryParamsSchema =
  PaginationQueryParamsSchema.merge(RefQueryParamSchema);

// Project Metadata Schemas (Runtime DB - unversioned)
export const ProjectMetadataSelectSchema = createSelectSchema(projectMetadata);
export const ProjectMetadataInsertSchema = createInsertSchema(projectMetadata).omit({
  createdAt: true,
});

export const WorkAppGitHubInstallationStatusSchema = z.enum([
  'pending',
  'active',
  'suspended',
  'disconnected',
]);
export const WorkAppGitHubAccountTypeSchema = z.enum(['Organization', 'User']);

export const WorkAppGitHubInstallationSelectSchema = createSelectSchema(workAppGitHubInstallations);
export const WorkAppGitHubInstallationInsertSchema = createInsertSchema(workAppGitHubInstallations)
  .omit({
    createdAt: true,
    updatedAt: true,
    status: true,
  })
  .extend({
    accountType: WorkAppGitHubAccountTypeSchema,
    status: WorkAppGitHubInstallationStatusSchema.optional().default('active'),
  });

export const WorkAppGithubInstallationApiSelectSchema = omitTenantScope(
  WorkAppGitHubInstallationSelectSchema
);
export const WorkAppGitHubInstallationApiInsertSchema = omitGeneratedFields(
  WorkAppGitHubInstallationInsertSchema
);

export const WorkAppGitHubRepositorySelectSchema = createSelectSchema(workAppGitHubRepositories);
export const WorkAppGitHubRepositoryInsertSchema = omitTimestamps(
  createInsertSchema(workAppGitHubRepositories)
);

export const WorkAppGitHubRepositoryApiInsertSchema = omitGeneratedFields(
  WorkAppGitHubRepositoryInsertSchema
);

export const WorkAppGitHubProjectRepositoryAccessSelectSchema = createSelectSchema(
  workAppGitHubProjectRepositoryAccess
);

export const WorkAppGitHubMcpToolRepositoryAccessSelectSchema = createSelectSchema(
  workAppGitHubMcpToolRepositoryAccess
);

// Shared GitHub Access API Schemas
export const WorkAppGitHubAccessModeSchema = z.enum(['all', 'selected']);

export const WorkAppGitHubAccessSetRequestSchema = z.object({
  mode: WorkAppGitHubAccessModeSchema,
  repositoryIds: z
    .array(z.string())
    .optional()
    .describe('Internal repository IDs (required when mode="selected")'),
});

export const WorkAppGitHubAccessSetResponseSchema = z.object({
  mode: WorkAppGitHubAccessModeSchema,
  repositoryCount: z.number(),
});

export const WorkAppGitHubAccessGetResponseSchema = z.object({
  mode: WorkAppGitHubAccessModeSchema,
  repositories: z.array(WorkAppGitHubRepositorySelectSchema),
});

// Slack Schemas (Runtime DB - unversioned)
export const WorkAppSlackChannelAgentConfigSelectSchema = createSelectSchema(
  workAppSlackChannelAgentConfigs
);
export const WorkAppSlackWorkspaceSelectSchema = createSelectSchema(workAppSlackWorkspaces);

// Shared Slack Agent Config API Schemas
// Request: projectId + agentId derived from DB schema, grantAccessToMembers optional (defaults on write)
export const WorkAppSlackAgentConfigRequestSchema = WorkAppSlackChannelAgentConfigSelectSchema.pick(
  {
    projectId: true,
    agentId: true,
  }
).extend({
  grantAccessToMembers: z.boolean().optional(),
});

// Response: extends request with resolved display names
export const WorkAppSlackAgentConfigResponseSchema = WorkAppSlackAgentConfigRequestSchema.extend({
  agentName: z.string(),
  projectName: z.string().optional(),
});

export type WorkAppSlackAgentConfigRequest = z.infer<typeof WorkAppSlackAgentConfigRequestSchema>;
export type WorkAppSlackAgentConfigResponse = z.infer<typeof WorkAppSlackAgentConfigResponseSchema>;
