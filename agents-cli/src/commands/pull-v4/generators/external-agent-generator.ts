import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { asRecord } from '../collector-common';
import {
  buildSequentialNameFileNames,
  resolveExternalAgentNamingSeed,
} from '../generation-resolver';
import type { GenerationTask } from '../generation-types';
import { addNamedImports, applyImportPlan, createImportPlan } from '../import-plan';
import { generateSimpleFactoryDefinition } from '../simple-factory-generator';
import { addValueToObject, codeReference, toCamelCase } from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.externalAgents.unwrap().valueType.omit({
  id: true,
});

const ExternalAgentSchema = z.strictObject({
  externalAgentId: z.string().nonempty(),
  externalAgentReferenceName: z.string().optional(),
  ...MySchema.shape,
});

type ExternalAgentInput = z.input<typeof ExternalAgentSchema>;

export function generateExternalAgentDefinition({
  id,
  tenantId,
  projectId,
  createdAt,
  updatedAt,
  ...data
}: ExternalAgentInput & Record<string, unknown>): SourceFile {
  return generateSimpleFactoryDefinition(data, {
    schema: ExternalAgentSchema,
    factory: {
      importName: 'externalAgent',
      variableName: (parsed) =>
        parsed.externalAgentReferenceName ?? toCamelCase(parsed.externalAgentId),
    },
    buildConfig(parsed) {
      const {
        externalAgentReferenceName: _externalAgentReferenceName,
        externalAgentId,
        credentialReferenceId: _credentialReferenceId,
        ...rest
      } = parsed;
      return {
        id: externalAgentId,
        ...rest,
      };
    },
    finalize({ parsed, sourceFile, configObject }) {
      if (!parsed.credentialReferenceId) {
        return;
      }

      const credentialReferenceName = toCamelCase(parsed.credentialReferenceId);
      const importPlan = createImportPlan();
      addNamedImports(
        importPlan,
        `../credentials/${parsed.credentialReferenceId}`,
        credentialReferenceName
      );
      applyImportPlan(sourceFile, importPlan);
      addValueToObject(configObject, 'credentialReference', codeReference(credentialReferenceName));
    },
  });
}

export const task = {
  type: 'external-agent',
  collect(context) {
    const externalAgentEntries = Object.entries(context.project.externalAgents ?? {});
    const fileNamesByExternalAgentId = buildSequentialNameFileNames(
      externalAgentEntries.map(([externalAgentId, externalAgentData]) => [
        externalAgentId,
        { name: resolveExternalAgentNamingSeed(externalAgentId, externalAgentData) },
      ])
    );

    return externalAgentEntries.map(([externalAgentId, externalAgentData]) => {
      const externalAgentRecord = asRecord(externalAgentData) ?? {};
      return {
        id: externalAgentId,
        filePath: context.resolver.resolveOutputFilePath(
          'externalAgents',
          externalAgentId,
          join(context.paths.externalAgentsDir, fileNamesByExternalAgentId[externalAgentId])
        ),
        payload: {
          externalAgentId,
          externalAgentReferenceName:
            context.resolver.getExternalAgentReferenceName(externalAgentId),
          ...externalAgentRecord,
        } as Parameters<typeof generateExternalAgentDefinition>[0],
      };
    });
  },
  generate: generateExternalAgentDefinition,
} satisfies GenerationTask<Parameters<typeof generateExternalAgentDefinition>[0]>;
