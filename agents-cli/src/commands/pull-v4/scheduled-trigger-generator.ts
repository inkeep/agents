import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { addValueToObject, createFactoryDefinition, toCamelCase } from './utils';

type ScheduledTriggerDefinitionData = {
  scheduledTriggerId: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  cronExpression?: string | null;
  cronTimezone?: string | null;
  runAt?: string | null;
  payload?: Record<string, unknown> | null;
  messageTemplate?: string | null;
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
  runAsUserId?: string | null;
};

const nullToUndefined = (v: string | null | undefined) => v ?? undefined;

const ScheduledTriggerSchema = z.looseObject({
  scheduledTriggerId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().nullable().optional().transform(nullToUndefined),
  enabled: z.boolean().optional(),
  cronExpression: z.string().nullable().optional().transform(nullToUndefined),
  cronTimezone: z.string().nullable().optional().transform(nullToUndefined),
  runAt: z.string().nullable().optional().transform(nullToUndefined),
  payload: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  messageTemplate: z.string().nullable().optional().transform(nullToUndefined),
  maxRetries: z.number().optional(),
  retryDelaySeconds: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  runAsUserId: z.string().nullable().optional().transform(nullToUndefined),
});

export function generateScheduledTriggerDefinition(
  data: ScheduledTriggerDefinitionData
): SourceFile {
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
