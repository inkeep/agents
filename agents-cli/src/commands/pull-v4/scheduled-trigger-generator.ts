import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from './utils';

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
  // @ts-expect-error
  id,
  // @ts-expect-error
  runAsUserId,
  // @ts-expect-error
  createdBy,
  ...data
}: ScheduledTriggerInput): SourceFile {
  const result = ScheduledTriggerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed for scheduled trigger:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  const { sourceFile, configObject } = createFactoryDefinition({
    importName: 'ScheduledTrigger',
    variableName: toCamelCase(parsed.scheduledTriggerId),
    syntaxKind: SyntaxKind.NewExpression,
  });

  const { scheduledTriggerId, ...rest } = parsed;

  for (const [key, value] of Object.entries({
    id: scheduledTriggerId,
    ...rest,
  })) {
    addValueToObject(configObject, key, value);
  }

  return sourceFile;
}
