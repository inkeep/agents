import {
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  FunctionApiInsertSchema,
  StringRecordSchema,
  SubAgentStopWhenSchema,
  ToolInsertSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { serializeJson } from '@/lib/utils';

// import { generateIdFromName } from '@/lib/utils/generate-id';

const OriginalContextConfigSchema =
  AgentWithinContextOfProjectSchema.shape.contextConfig.unwrap().shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.unwrap().shape;
const ModelsSchema = AgentWithinContextOfProjectSchema.shape.models.unwrap().shape;
const StopWhenSchema = AgentWithinContextOfProjectSchema.shape.stopWhen.unwrap();
// const SubAgentsSchema = AgentWithinContextOfProjectSchema.shape.subAgents;

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

export const FullAgentUpdateSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
}).extend({
  // nodes: z.array(z.any()).optional(),
  // subAgents: SubAgentsSchema,
  subAgents: z.record(
    // z.preprocess(
    //   (value: any) => {
    //     return {
    //       id: generateIdFromName(value.name),
    //       ...value,
    //     };
    //   },
    z.string(),
    z.looseObject({
      id: z.string().trim().nonempty(),
      name: z.string().trim().nonempty(),
      description: z.string().trim().nullish(),
      skills: z
        .array(
          z.strictObject({
            id: z.string().trim(),
            index: z.int().positive(),
            alwaysLoaded: z.boolean().optional(),
            // description: z.string().trim(),
          })
        )
        .optional(),
      prompt: z.string().trim().optional(),
      // TODO: use updateDefaultSubAgent logic
      isDefault: z.boolean().optional(),
      models: MyModelsSchema.partial(),
      stopWhen: SubAgentStopWhenSchema.optional(),
      dataComponents: z.array(z.string()).optional(),
      artifactComponents: z.array(z.string()).optional(),
    })
    // )
  ),
  functionTools: z.record(
    z.string(),
    z.looseObject({
      name: z.string().trim().nonempty(),
      description: z.string().trim().optional(),
      executeCode: FunctionApiInsertSchema.shape.executeCode,
      inputSchema: z
        .string()
        .trim()
        .transform((val, ctx) => (val ? transformToJson(val, ctx) : undefined))
        .pipe(z.record(z.string(), z.unknown(), 'Input Schema is required')),
      dependencies: StringToStringRecordSchema,
      tempToolPolicies: z
        .strictObject({
          '*': z.strictObject({
            needsApproval: z.boolean(),
          }),
        })
        .optional(),
    })
  ),
  externalAgents: z.record(
    z.string(),
    z.looseObject({
      id: z.string().trim(),
      baseUrl: z.url(),
      name: z.string().trim(),
      description: z.string().trim().nullish(),
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  teamAgents: z.record(
    z.string(),
    z.looseObject({
      name: z.string().trim().nonempty(),
      id: z.string().trim().nonempty(),
      description: z.string().trim(),
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  tools: z.record(
    z.string(),
    z.looseObject({
      id: z.string().trim().nonempty(),
      name: z.string().trim().nonempty(),
      config: ToolInsertSchema.shape.config,
      // TODO or tempHeaders
      headers: StringToStringRecordSchema,
    })
  ),
  stopWhen: StopWhenSchema.extend({
    transferCountIs: NullToUndefinedSchema.pipe(StopWhenSchema.shape.transferCountIs).optional(),
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

export type FullAgentInput = z.input<typeof AgentWithinContextOfProjectSchema>;
export type FullAgentOutput = z.output<typeof AgentWithinContextOfProjectSchema>;

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
    subAgents: Object.fromEntries(
      Object.entries(subAgents).map(([key, value]) => [
        key,
        {
          ...value,
          models: serializeModels(value.models ?? {}),
        },
      ])
    ),
    functionTools: Object.fromEntries(
      Object.values(functions).map((tool) => [
        tool.id,
        {
          ...tool,
          name: functionTools[tool.id].name,
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
          headers: serializeJson(o.headers),
        },
      ])
    ),
  };
}
