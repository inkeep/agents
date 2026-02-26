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
import { generateIdFromName } from '@/lib/utils/generate-id';

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
})
  .extend({
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
        description: z.string().trim(),
        skills: z.array(
          z.strictObject({
            id: z.string().trim(),
            index: z.int().positive(),
            alwaysLoaded: z.boolean().optional(),
            // description: z.string().trim(),
          })
        ),
        prompt: z.string().trim(),
        // TODO: use updateDefaultSubAgent logic
        isDefault: z.boolean().optional(),
        models: MyModelsSchema.nullable(),
        stopWhen: SubAgentStopWhenSchema.nullable(),
        dataComponents: z.array(z.string()),
        artifactComponents: z.array(z.string()),
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
        description: z.string().trim(),
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
  })
  .transform(({ subAgents, ...rest }) => {
    return rest;
  });

export type FullAgentResponse = z.infer<typeof AgentWithinContextOfProjectResponse>['data'];

export type FullAgentDefinition = z.input<typeof AgentWithinContextOfProjectSchema>;

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
    models: {
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
    },
    subAgents,
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
    externalAgents,
    teamAgents,
    tools,
  };
}
