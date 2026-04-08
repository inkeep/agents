import {
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchemaBase as AgentWithinContextOfProjectSchema,
  StringRecordSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { getFunctionToolGraphKey, getMcpGraphKey } from '@/features/agent/domain/graph-keys';
import { serializeJson, serializeModels } from '@/lib/utils';
import { StringToJsonSchema } from '@/lib/validation';

const OriginalContextConfigSchema =
  AgentWithinContextOfProjectSchema.shape.contextConfig.unwrap().shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.unwrap().shape;
const ModelsSchema = AgentWithinContextOfProjectSchema.shape.models.unwrap().shape;
const AgentStopWhenSchema = AgentWithinContextOfProjectSchema.shape.stopWhen.unwrap();
const SubAgentSchema = AgentWithinContextOfProjectSchema.shape.subAgents.valueType.omit({
  updatedAt: true,
  createdAt: true,
});
const ExternalAgentSchema = AgentWithinContextOfProjectSchema.shape.externalAgents
  .unwrap()
  .valueType.pick({
    name: true,
    id: true,
    description: true,
    baseUrl: true,
  });
const TeamAgentSchema = AgentWithinContextOfProjectSchema.shape.teamAgents.unwrap().valueType;
const FunctionToolSchema = AgentWithinContextOfProjectSchema.shape.functionTools
  .unwrap()
  .valueType.pick({
    name: true,
    description: true,
    functionId: true,
  });
const FunctionSchema = AgentWithinContextOfProjectSchema.shape.functions.unwrap().valueType.pick({
  executeCode: true,
  dependencies: true,
  inputSchema: true,
});
const ModelsBaseSchema = ModelsSchema.base.unwrap();
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

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

const MyModelsSchema = z
  .strictObject({
    base: ModelsBaseSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsBaseSchema.shape.providerOptions),
    }),
    structuredOutput: ModelsStructuredOutputSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsStructuredOutputSchema.shape.providerOptions),
    }),
    summarizer: ModelsSummarizerSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsSummarizerSchema.shape.providerOptions),
    }),
  })
  .transform(({ base, structuredOutput, summarizer, ...value }) => {
    return {
      ...value,
      ...(base.model && { base }),
      ...(structuredOutput.model && { structuredOutput }),
      ...(summarizer.model && { summarizer }),
    };
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
  selectedTools: z.array(z.string()).nullable().optional(),
  headers: StringToStringRecordSchema,
  toolPolicies: ToolPoliciesSchema,
});

export const FunctionToolRelationSchema = z.strictObject({
  relationshipId: z.string().trim().optional(),
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
    .pipe(FunctionSchema.shape.inputSchema)
    .optional(),
});
export const FullAgentToolSchema = AgentWithinContextOfProjectSchema.shape.tools
  .unwrap()
  .valueType.pick({
    id: true,
    name: true,
    config: true,
    imageUrl: true,
  });
const FullAgentExternalAgentSchema = z.object({
  ...ExternalAgentSchema.shape,
  headers: StringToStringRecordSchema.optional(),
});
export const FullAgentTeamAgentSchema = z.object({
  ...TeamAgentSchema.shape,
  headers: StringToStringRecordSchema.optional(),
});
const SubAgentStopWhenSchema = SubAgentSchema.shape.stopWhen.unwrap();

export const FullAgentSubAgentSchema = z.strictObject({
  ...SubAgentSchema.shape,
  type: SubAgentSchema.shape.type.default('internal'),
  models: MyModelsSchema,
  stopWhen: z.strictObject({
    ...SubAgentStopWhenSchema.shape,
    stepCountIs: z
      .preprocess((v) => v ?? undefined, SubAgentStopWhenSchema.shape.stepCountIs)
      .optional(),
  }),
});
type FullAgentSubAgent = z.input<typeof FullAgentSubAgentSchema>;

export type AgentSkill = NonNullable<FullAgentSubAgent['skills']>[number];

const FullAgentSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
  executionMode: true,
});

export const FullAgentFormSchema = z.strictObject({
  ...FullAgentSchema.shape,
  defaultSubAgentNodeId: AgentWithinContextOfProjectSchema.shape.defaultSubAgentId.refine(
    (val) => val,
    'Default sub agent ID is required, please select a default sub agent.'
  ),
  subAgents: z
    .record(z.string(), FullAgentSubAgentSchema)
    .superRefine((subAgents, ctx) => {
      const nodeIdsBySubAgentId = new Map<string, string[]>();

      for (const [nodeId, subAgent] of Object.entries(subAgents)) {
        const subAgentId = subAgent.id;
        const current = nodeIdsBySubAgentId.get(subAgentId) ?? [];
        nodeIdsBySubAgentId.set(subAgentId, [...current, nodeId]);
      }

      for (const [subAgentId, nodeIds] of nodeIdsBySubAgentId) {
        if (nodeIds.length < 2) continue;

        for (const nodeId of nodeIds) {
          ctx.addIssue({
            code: 'custom',
            path: [nodeId, 'id'],
            message: `Sub agent ID "${subAgentId}" must be unique.`,
          });
        }
      }
    })
    .optional(),
  functionTools: z.record(z.string(), FullAgentFunctionToolSchema).optional(),
  functionToolRelations: z.record(z.string(), FunctionToolRelationSchema).optional(),
  functions: z.record(z.string(), FullAgentFunctionSchema).optional(),
  externalAgents: z.record(z.string(), FullAgentExternalAgentSchema).optional(),
  teamAgents: z.record(z.string(), FullAgentTeamAgentSchema).optional(),
  tools: z.record(z.string(), FullAgentToolSchema),
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

// TODO future improvement
// .superRefine((value, ctx) => {
//   for (const [functionToolId, functionTool] of Object.entries(value.functionTools)) {
//     const used = Object.values(value.subAgents).some((subAgent) =>
//       subAgent.canUse.some((tool) => tool.toolId === functionToolId)
//     );
//
//     if (used) continue;
//     ctx.addIssue({
//       code: 'custom',
//       message: `Function tool "${functionTool.name}" isn't connected`,
//       path: ['functionTools', functionToolId, 'global'],
//     });
//   }
//   console.log('superRefine', value);
// });

export type FullAgentResponse = z.infer<typeof AgentWithinContextOfProjectResponse>['data'];

export type FullAgentFormInputValues = z.input<typeof FullAgentFormSchema>;
export type FullAgentFormValues = z.output<typeof FullAgentFormSchema>;

export type FullAgentPayload = z.infer<typeof AgentWithinContextOfProjectSchema>;

export function apiToFormValues(data: FullAgentResponse) {
  const {
    id,
    name,
    description,
    prompt,
    contextConfig,
    stopWhen,
    models = {},
    subAgents,
    functions = {},
    functionTools = {},
    externalAgents = {},
    teamAgents = {},
    tools = {},
    defaultSubAgentId,
    executionMode,
  } = data;
  const statusUpdates = data.statusUpdates ?? {};

  const sharedExternalAgentHeaders = new Map<string, string>();
  const sharedTeamAgentHeaders = new Map<string, string>();
  const sharedFunctionToolPolicies = new Map<string, Record<string, { needsApproval?: boolean }>>();

  for (const subAgent of Object.values(subAgents)) {
    for (const delegate of subAgent.canDelegateTo ?? []) {
      if (typeof delegate !== 'object') {
        continue;
      }

      if ('externalAgentId' in delegate) {
        if (!sharedExternalAgentHeaders.has(delegate.externalAgentId)) {
          sharedExternalAgentHeaders.set(delegate.externalAgentId, serializeJson(delegate.headers));
        }
        continue;
      }

      if ('agentId' in delegate && !sharedTeamAgentHeaders.has(delegate.agentId)) {
        sharedTeamAgentHeaders.set(delegate.agentId, serializeJson(delegate.headers));
      }
    }

    for (const canUseItem of subAgent.canUse ?? []) {
      if (!functionTools[canUseItem.toolId] || !canUseItem.toolPolicies) {
        continue;
      }

      const mergedPolicies = sharedFunctionToolPolicies.get(canUseItem.toolId) ?? {};

      for (const [toolName, policy] of Object.entries(canUseItem.toolPolicies)) {
        const currentPolicy = mergedPolicies[toolName];
        const needsApproval =
          currentPolicy?.needsApproval === true || policy.needsApproval === true
            ? true
            : currentPolicy?.needsApproval === false || policy.needsApproval === false
              ? false
              : undefined;

        mergedPolicies[toolName] = {
          ...currentPolicy,
          ...policy,
          ...(needsApproval !== undefined ? { needsApproval } : {}),
        };
      }

      sharedFunctionToolPolicies.set(canUseItem.toolId, mergedPolicies);
    }
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
    defaultSubAgentNodeId: defaultSubAgentId,
    executionMode,
    subAgents: Object.fromEntries(
      Object.entries(subAgents).map(([key, value]) => [
        key,
        {
          ...value,
          stopWhen: {
            // `stopWhen` can be `null` from api response
            stepCountIs: value.stopWhen?.stepCountIs ?? null,
          },
          models: serializeModels(value.models ?? {}),
          skills: value.skills?.map((skill) => ({
            id: skill.id,
            index: skill.index,
            alwaysLoaded: skill.alwaysLoaded,
          })),
        },
      ])
    ),
    functionTools: Object.fromEntries(
      Object.values(functionTools).map((tool) => [
        tool.id,
        {
          ...tool,
          tempToolPolicies: sharedFunctionToolPolicies.get(tool.id) ?? {},
        },
      ])
    ),
    functionToolRelations: Object.fromEntries(
      Object.entries(subAgents).flatMap(([_subAgentId, subAgent]) =>
        (subAgent.canUse ?? []).flatMap((canUseItem) => {
          if (!canUseItem.agentToolRelationId || !functionTools[canUseItem.toolId]) {
            return [];
          }

          return [
            [
              getFunctionToolGraphKey({ toolId: canUseItem.toolId }),
              {
                relationshipId: canUseItem.agentToolRelationId,
              },
            ],
          ];
        })
      )
    ),
    functions: Object.fromEntries(
      Object.values(functions).map((tool) => [
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
          headers: sharedExternalAgentHeaders.get(o.id),
        },
      ])
    ),
    teamAgents: Object.fromEntries(
      Object.values(teamAgents).map((o) => [
        o.id,
        {
          ...o,
          headers: sharedTeamAgentHeaders.get(o.id),
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
              getMcpGraphKey({
                subAgentId,
                toolId: canUseItem.toolId,
                relationshipId: canUseItem.agentToolRelationId,
              }),
              {
                toolId: canUseItem.toolId,
                relationshipId: canUseItem.agentToolRelationId,
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
