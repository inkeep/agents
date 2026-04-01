import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { asRecord } from '../collector-common';
import { buildSequentialNameFileNames } from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { addNamedImports, applyImportPlan, createImportPlan } from '../import-plan';
import { generateFactorySourceFile } from '../simple-factory-generator';
import { addValueToObject, codeReference, toCamelCase, toTriggerReferenceName } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.agents.valueType.shape.triggers
  .unwrap()
  .valueType.omit({
    id: true,
  });

const TriggerSchema = z.strictObject({
  triggerId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  inputSchema: z.preprocess((v) => v || undefined, MySchema.shape.inputSchema),
  outputTransform: z.preprocess((v) => v || undefined, MySchema.shape.outputTransform),
  messageTemplate: z.preprocess((v) => v || undefined, MySchema.shape.messageTemplate),
  authentication: z.preprocess(
    (v) => v || undefined,
    // ✖ Invalid input: expected string, received undefined
    // → at authentication.headers[0].value
    z.unknown()
  ),
  signatureVerification: z.preprocess((v) => v || undefined, MySchema.shape.signatureVerification),
  signingSecretCredentialReferenceName: z.string().nonempty().optional(),
  signingSecretCredentialReferencePath: z.string().nonempty().optional(),
});

type TriggerInput = z.input<typeof TriggerSchema>;

export function generateTriggerDefinition({
  id,
  runAsUserId,
  createdBy,
  ...data
}: TriggerInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: TriggerSchema,
    factory: {
      importName: 'Trigger',
      variableName: (parsed) => toTriggerReferenceName(parsed.name),
      syntaxKind: SyntaxKind.NewExpression,
    },
    render({ parsed, sourceFile, configObject }) {
      const {
        triggerId,
        signingSecretCredentialReferenceId,
        signingSecretCredentialReferenceName,
        signingSecretCredentialReferencePath,
        ...rest
      } = parsed;

      for (const [key, value] of Object.entries({
        id: triggerId,
        ...rest,
      })) {
        addValueToObject(configObject, key, value);
      }

      const importPlan = createImportPlan();
      if (signingSecretCredentialReferenceId) {
        const varName =
          signingSecretCredentialReferenceName ??
          toCamelCase(signingSecretCredentialReferenceId as string);
        const modulePath =
          signingSecretCredentialReferencePath ?? (signingSecretCredentialReferenceId as string);
        addNamedImports(importPlan, `../../credentials/${modulePath}`, varName);
        addValueToObject(configObject, 'signingSecretCredentialReference', codeReference(varName));
      }
      applyImportPlan(sourceFile, importPlan);
    },
  });
}

export const task = {
  type: 'trigger',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const records = [];
    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      if (!agentData?.triggers) {
        continue;
      }

      const triggerEntries = Object.entries(agentData.triggers);
      const fileNamesByTriggerId = buildSequentialNameFileNames(triggerEntries);

      for (const [triggerId, triggerData] of triggerEntries) {
        const triggerRecord = asRecord(triggerData);
        const signingSecretCredentialReferenceId =
          typeof triggerRecord?.signingSecretCredentialReferenceId === 'string'
            ? triggerRecord.signingSecretCredentialReferenceId
            : undefined;
        const signingSecretCredentialReferenceName = signingSecretCredentialReferenceId
          ? context.resolver.getCredentialReferenceName(signingSecretCredentialReferenceId)
          : undefined;
        const signingSecretCredentialReferencePath = signingSecretCredentialReferenceId
          ? context.resolver.getCredentialReferencePath(signingSecretCredentialReferenceId)
          : undefined;

        records.push({
          id: triggerId,
          filePath: context.resolver.resolveOutputFilePath(
            'triggers',
            triggerId,
            join(context.paths.agentsDir, 'triggers', fileNamesByTriggerId[triggerId])
          ),
          payload: {
            triggerId,
            ...triggerData,
            ...(signingSecretCredentialReferenceName && {
              signingSecretCredentialReferenceName,
            }),
            ...(signingSecretCredentialReferencePath && {
              signingSecretCredentialReferencePath,
            }),
          } as Parameters<typeof generateTriggerDefinition>[0],
        });
      }
    }

    return records;
  },
  generate: generateTriggerDefinition,
} satisfies GenerationTask<Parameters<typeof generateTriggerDefinition>[0]>;
