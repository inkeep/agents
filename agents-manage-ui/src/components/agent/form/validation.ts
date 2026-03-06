import {
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  StringRecordSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { serializeJson } from '@/lib/utils';

const OriginalContextConfigSchema =
  AgentWithinContextOfProjectSchema.shape.contextConfig.unwrap().shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.unwrap().shape;
const ModelsSchema = AgentWithinContextOfProjectSchema.shape.models.unwrap().shape;
const AgentStopWhenSchema = AgentWithinContextOfProjectSchema.shape.stopWhen.unwrap();
const SubAgentSchema = AgentWithinContextOfProjectSchema.shape.subAgents.valueType;
const ExternalAgentSchema = AgentWithinContextOfProjectSchema.shape.externalAgents
  .unwrap()
  .valueType.pick({
    name: true,
    id: true,
    description: true,
    baseUrl: true,
  });
const TeamAgentSchema = AgentWithinContextOfProjectSchema.shape.teamAgents.unwrap().valueType;
const ToolSchema = AgentWithinContextOfProjectSchema.shape.tools.unwrap().valueType.pick({
  id: true,
  name: true,
  config: true,
});
const FunctionToolSchema = AgentWithinContextOfProjectSchema.shape.functionTools
  .unwrap()
  .valueType.pick({
    name: true,
    description: true,
    functionId: true,
    // id: true,
  });
const FunctionSchema = AgentWithinContextOfProjectSchema.shape.functions.unwrap().valueType.pick({
  executeCode: true,
  dependencies: true,
  inputSchema: true,
});
const ModelsBaseSchema = ModelsSchema.base.unwrap();
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

const StringToJsonSchema = z
  .string()
  .trim()
  .transform((value, ctx) => (value === '' ? undefined : transformToJson(value, ctx)))
  .refine((v) => v !== null, 'Cannot be null')
  .optional();

const NullToUndefinedSchema = z
  // Normalize number input: <input type="number"> produce `null` for empty value,
  // but this schema expects `undefined` (optional field), not `null`.
  .transform((value: number) => (value === null ? undefined : value));

export const ContextConfigSchema = z.strictObject({
  id: OriginalContextConfigSchema.id,
  headersSchema: StringToJsonSchema.pipe(OriginalContextConfigSchema.headersSchema).default(null),
  contextVariables: StringToJsonSchema.pipe(OriginalContextConfigSchema.contextVariables).default(
    null
  ),
});

const MyModelsSchema = z.strictObject({
  base: ModelsBaseSchema.extend({
    providerOptions: StringToJsonSchema.pipe(ModelsBaseSchema.shape.providerOptions).optional(),
  }),
  structuredOutput: ModelsStructuredOutputSchema.extend({
    providerOptions: StringToJsonSchema.pipe(
      ModelsStructuredOutputSchema.shape.providerOptions
    ).optional(),
  }),
  summarizer: ModelsSummarizerSchema.extend({
    providerOptions: StringToJsonSchema.pipe(
      ModelsSummarizerSchema.shape.providerOptions
    ).optional(),
  }),
});

const StringToStringRecordSchema = z
  .string()
  .trim()
  .transform((val, ctx) => (val ? transformToJson(val, ctx) : undefined))
  .pipe(StringRecordSchema.optional());

const ToolPoliciesSchema = z
  .record(
    z.string(),
    z.strictObject({
      needsApproval: z.boolean().optional(),
    })
  )
  .optional();

export const MCPRelationSchema = z.strictObject({
  toolId: z.string().trim().nonempty(),
  relationshipId: z.string().trim().optional(),
  subAgentId: z.string().trim().optional(),
  selectedTools: z.array(z.string()).nullable().optional(),
  headers: StringToStringRecordSchema,
  toolPolicies: ToolPoliciesSchema,
});

export const FullAgentFunctionToolSchema = z.object({
  ...FunctionToolSchema.shape,
  tempToolPolicies: ToolPoliciesSchema,
});
export const FullAgentFunctionSchema = z.object({
  ...FunctionSchema.shape,
  dependencies: StringToStringRecordSchema.optional(),
  inputSchema: z
    .string()
    .trim()
    .transform((val, ctx) => (val ? transformToJson(val, ctx) : undefined))
    .pipe(FunctionSchema.shape.inputSchema),
});
const FullAgentSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
});

export const FullAgentUpdateSchema = z.strictObject({
  ...FullAgentSchema.shape,
  defaultSubAgentId: AgentWithinContextOfProjectSchema.shape.defaultSubAgentId.refine(
    (val) => val,
    'Default sub agent ID is required, please select a default sub agent.'
  ),
  subAgents: z.record(
    z.string(),
    z.strictObject({
      ...SubAgentSchema.shape,
      type: SubAgentSchema.shape.type.default('internal'),
      models: MyModelsSchema.partial(),
    })
  ),
  functionTools: z.record(z.string(), FullAgentFunctionToolSchema),
  functions: z.record(z.string(), FullAgentFunctionSchema),
  externalAgents: z.record(
    z.string(),
    z.object({
      ...ExternalAgentSchema.shape,
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  teamAgents: z.record(
    z.string(),
    z.object({
      ...TeamAgentSchema.shape,
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  tools: z.record(
    z.string(),
    z.object({
      ...ToolSchema.shape,
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  mcpRelations: z.record(z.string(), MCPRelationSchema).optional(),
  stopWhen: AgentStopWhenSchema.extend({
    transferCountIs: NullToUndefinedSchema.pipe(
      AgentStopWhenSchema.shape.transferCountIs
    ).optional(),
  }).optional(),
  contextConfig: ContextConfigSchema,
  statusUpdates: z.strictObject({
    ...StatusUpdatesSchema,
    numEvents: NullToUndefinedSchema.pipe(StatusUpdatesSchema.numEvents).optional(),
    timeInSeconds: NullToUndefinedSchema.pipe(StatusUpdatesSchema.timeInSeconds).optional(),
    statusComponents: StringToJsonSchema.pipe(StatusUpdatesSchema.statusComponents).optional(),
  }),
  models: MyModelsSchema,
});

export type FullAgentResponse = z.infer<typeof AgentWithinContextOfProjectResponse>['data'];

export type FullAgentOutput = z.output<typeof FullAgentUpdateSchema>;

export function serializeAgentForm(data: FullAgentResponse) {
  const {
    id,
    name,
    description,
    prompt,
    contextConfig,
    statusUpdates = {},
    stopWhen,
    models = {},
    subAgents,
    functions = {},
    functionTools = {},
    externalAgents = {},
    teamAgents = {},
    tools = {},
    defaultSubAgentId,
  } = data;

  function serializeModels(models: NonNullable<typeof data.models>) {
    return {
      base: {
        ...models.base,
        providerOptions: serializeJson(models.base?.providerOptions),
      },
      structuredOutput: {
        ...models.structuredOutput,
        providerOptions: serializeJson(models.structuredOutput?.providerOptions),
      },
      summarizer: {
        ...models.summarizer,
        providerOptions: serializeJson(models.summarizer?.providerOptions),
      },
    };
  }

  return {
    id,
    name,
    description,
    prompt: prompt ?? '',
    contextConfig: {
      id: contextConfig?.id,
      headersSchema: serializeJson(contextConfig?.headersSchema),
      contextVariables: serializeJson(contextConfig?.contextVariables),
    },
    statusUpdates: {
      ...statusUpdates,
      enabled: statusUpdates.enabled ?? false,
      numEvents: statusUpdates.numEvents ?? 10,
      timeInSeconds: statusUpdates.timeInSeconds ?? 30,
      prompt: statusUpdates.prompt ?? '',
      statusComponents: serializeJson(statusUpdates.statusComponents),
    },
    stopWhen: {
      transferCountIs: stopWhen?.transferCountIs ?? 10,
    },
    models: serializeModels(models),
    defaultSubAgentId,
    subAgents: Object.fromEntries(
      Object.entries(subAgents).map(([key, value]) => [
        key,
        {
          ...value,
          // `stopWhen` can be `null` from api response
          stopWhen: value.stopWhen ?? undefined,
          models: serializeModels(value.models ?? {}),
        },
      ])
    ),
    functionTools: Object.fromEntries(
      Object.values(functionTools).map(({ createdAt, updatedAt, ...tool }) => [tool.id, tool])
    ),
    functions: Object.fromEntries(
      Object.values(functions).map(({ createdAt, updatedAt, ...tool }) => [
        tool.id,
        {
          ...tool,
          inputSchema: serializeJson(tool.inputSchema),
          dependencies: serializeJson(tool.dependencies),
        },
      ])
    ),
    externalAgents: Object.fromEntries(
      Object.values(externalAgents).map((o) => [
        o.id,
        {
          ...o,
          // @ts-expect-error
          headers: serializeJson(o.headers),
        },
      ])
    ),
    teamAgents: Object.fromEntries(
      Object.values(teamAgents).map((o) => [
        o.id,
        {
          ...o,
          // @ts-expect-error
          headers: serializeJson(o.headers),
        },
      ])
    ),
    tools: Object.fromEntries(
      Object.values(tools).map((o) => [
        o.id,
        {
          ...o,
          imageUrl: o.imageUrl ?? undefined,
          headers: serializeJson(o.headers),
        },
      ])
    ),
    mcpRelations: Object.fromEntries(
      Object.entries(subAgents).flatMap(([subAgentId, subAgent]) =>
        (subAgent.canUse ?? []).flatMap((canUseItem) => {
          if (!canUseItem.agentToolRelationId || !tools[canUseItem.toolId]) {
            return [];
          }

          return [
            [
              canUseItem.agentToolRelationId,
              {
                toolId: canUseItem.toolId,
                relationshipId: canUseItem.agentToolRelationId,
                subAgentId,
                selectedTools: canUseItem.toolSelection ?? null,
                headers: serializeJson(canUseItem.headers),
                toolPolicies: canUseItem.toolPolicies ?? {},
              },
            ],
          ];
        })
      )
    ),
  };
}
