import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { buildSequentialNameFileNames } from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { generateSimpleFactoryDefinition } from '../simple-factory-generator';
import { toTriggerReferenceName } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.agents.valueType.shape.scheduledTriggers
  .unwrap()
  .valueType.omit({
    id: true,
    runAsUserId: true,
    createdBy: true,
  });

const ScheduledTriggerSchema = z.strictObject({
  scheduledTriggerId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v ?? undefined, MySchema.shape.description),
  runAt: z.preprocess((v) => v ?? undefined, MySchema.shape.runAt),
  payload: z.preprocess((v) => v ?? undefined, MySchema.shape.payload),
});

type ScheduledTriggerInput = z.input<typeof ScheduledTriggerSchema>;

export function generateScheduledTriggerDefinition({
  id,
  runAsUserId,
  createdBy,
  ...data
}: ScheduledTriggerInput & Record<string, unknown>): SourceFile {
  return generateSimpleFactoryDefinition(data, {
    schema: ScheduledTriggerSchema,
    factory: {
      importName: 'ScheduledTrigger',
      variableName: (parsed) => toTriggerReferenceName(parsed.name),
      syntaxKind: SyntaxKind.NewExpression,
    },
    buildConfig(parsed) {
      const { scheduledTriggerId, ...rest } = parsed;
      return {
        id: scheduledTriggerId,
        ...rest,
      };
    },
  });
}

export const task = {
  type: 'scheduled-trigger',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const records = [];
    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      if (!agentData?.scheduledTriggers) {
        continue;
      }

      const scheduledTriggerEntries = Object.entries(agentData.scheduledTriggers);
      const fileNamesByScheduledTriggerId = buildSequentialNameFileNames(scheduledTriggerEntries);

      for (const [scheduledTriggerId, scheduledTriggerData] of Object.entries(
        agentData.scheduledTriggers
      )) {
        records.push({
          id: scheduledTriggerId,
          filePath: context.resolver.resolveOutputFilePath(
            'scheduledTriggers',
            scheduledTriggerId,
            join(
              context.paths.agentsDir,
              'scheduled-triggers',
              fileNamesByScheduledTriggerId[scheduledTriggerId]
            )
          ),
          payload: {
            scheduledTriggerId,
            ...scheduledTriggerData,
          } as Parameters<typeof generateScheduledTriggerDefinition>[0],
        });
      }
    }

    return records;
  },
  generate: generateScheduledTriggerDefinition,
} satisfies GenerationTask<Parameters<typeof generateScheduledTriggerDefinition>[0]>;
