import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { asRecord, resolveStatusComponentId } from '../collector-common';
import type { GenerationTask } from '../generation-types';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addValueToObject,
  buildComponentFileName,
  codeExpression,
  convertJsonSchemaToZodSafe,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.statusUpdates
  .unwrap()
  .shape.statusComponents.unwrap().element;

const StatusComponentSchema = z.strictObject({
  statusComponentId: z.string().nonempty(),
  ...MySchema.shape,
});

type StatusComponentInput = z.input<typeof StatusComponentSchema>;

export function generateStatusComponentDefinition({
  id,
  ...data
}: StatusComponentInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: StatusComponentSchema,
    factory: {
      importName: 'statusComponent',
      variableName: (parsed) => toCamelCase(parsed.statusComponentId),
    },
    render({ parsed, sourceFile, configObject }) {
      const { statusComponentId: _, detailsSchema, ...rest } = parsed;

      for (const [k, v] of Object.entries(rest)) {
        addValueToObject(configObject, k, v);
      }
      if (detailsSchema) {
        sourceFile.addImportDeclaration({
          namedImports: ['z'],
          moduleSpecifier: 'zod',
        });
        addValueToObject(
          configObject,
          'detailsSchema',
          codeExpression(convertJsonSchemaToZodSafe(detailsSchema))
        );
      }
    },
  });
}

export const task = {
  type: 'status-component',
  collect(context) {
    if (!context.project.agents) {
      return [];
    }

    const statusComponentRecordsById = new Map<
      string,
      ReturnType<
        GenerationTask<Parameters<typeof generateStatusComponentDefinition>[0]>['collect']
      >[number]
    >();

    for (const agentId of context.completeAgentIds) {
      const agentData = context.project.agents[agentId];
      const statusUpdates = asRecord(agentData?.statusUpdates);
      const statusComponents = Array.isArray(statusUpdates?.statusComponents)
        ? statusUpdates.statusComponents
        : [];

      for (const statusComponentData of statusComponents) {
        const payload = asRecord(statusComponentData);
        if (!payload) {
          continue;
        }

        const statusComponentId = resolveStatusComponentId(payload);
        if (!statusComponentId || statusComponentRecordsById.has(statusComponentId)) {
          continue;
        }

        const statusComponentName = typeof payload.name === 'string' ? payload.name : undefined;
        statusComponentRecordsById.set(statusComponentId, {
          id: statusComponentId,
          filePath: context.resolver.resolveOutputFilePath(
            'statusComponents',
            statusComponentId,
            join(
              context.paths.statusComponentsDir,
              buildComponentFileName(statusComponentId, statusComponentName)
            )
          ),
          payload: {
            statusComponentId,
            ...payload,
          } as Parameters<typeof generateStatusComponentDefinition>[0],
        });
      }
    }

    return [...statusComponentRecordsById.values()];
  },
  generate: generateStatusComponentDefinition,
} satisfies GenerationTask<Parameters<typeof generateStatusComponentDefinition>[0]>;
