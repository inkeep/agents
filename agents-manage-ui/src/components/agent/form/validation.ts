import {
  AgentWithinContextOfProjectSchema,
  transformToJson,
  type AgentWithinContextOfProjectResponse,
  SubAgentStopWhenSchema,
  StringRecordSchema,
  FunctionApiInsertSchema,
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

export const FullAgentUpdateSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
})
  .extend({
    // nodes: z.array(z.any()).optional(),
    // subAgents: SubAgentsSchema,
    subAgents: z.array(
      // z.preprocess(
      //   (value: any) => {
      //     return {
      //       id: generateIdFromName(value.name),
      //       ...value,
      //     };
      //   },
      z.looseObject({
        id: z.string().trim(),
        name: z.string().trim(),
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
        // models: MyModelsSchema,
        // stopWhen: SubAgentStopWhenSchema,
        dataComponents: z.array(z.string()),
        artifactComponents: z.array(z.string()),
      })
      // )
    ),
    functionTools: z.array(
      z.looseObject({
        name: z.string().trim().nonempty(),
        description: z.string().trim().optional(),
        executeCode: FunctionApiInsertSchema.shape.executeCode,
        inputSchema: z
          .string()
          .trim()
          .transform((val, ctx) => (val ? transformToJson(val, ctx) : undefined))
          .pipe(z.record(z.string(), z.unknown(), 'Input Schema is required')),
        dependencies: z
          .string()
          .trim()
          .transform((val, ctx) => (val ? transformToJson(val, ctx) : undefined))
          .pipe(StringRecordSchema.optional()),
        tempToolPolicies: z
          .strictObject({
            '*': z.strictObject({
              needsApproval: z.boolean(),
            }),
          })
          .optional(),
      })
    ),
    externalAgents: z.array(
      z.looseObject({
        id: z.string().trim(),
        name: z.string().trim(),
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

/**
 * Partial fields excluding keys from zod schema which is handled by react-hook-form
 * which isn't yet migrated to react hook form.
 * @deprecated
 */
export type PartialFullAgentDefinition = Omit<
  FullAgentDefinition,
  keyof z.input<typeof FullAgentUpdateSchema>
>;

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
  } = data;

  const functionTool = {
    ...functions['rn5612qh26zghl18rwjbn'],
    name: functionTools['rn5612qh26zghl18rwjbn'].name,
  };
  functionTool.inputSchema = serializeJson(functionTool.inputSchema);
  functionTool.dependencies = serializeJson(functionTool.dependencies);

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
    subAgents: [subAgents['websearch-agent']],
    functionTools: [functionTool],
    externalAgents: [externalAgents['4W7KdQdOHkfeMRHEOgGyK']],
  };
}
