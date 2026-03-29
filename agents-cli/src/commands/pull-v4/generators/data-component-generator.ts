import { join } from 'node:path';
import { FullProjectDefinitionSchema } from '@inkeep/agents-core';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { z } from 'zod';
import { collectReferencedSubAgentComponentIds } from '../collector-common';
import type { GenerationTask } from '../generation-types';
import { generateFactorySourceFile } from '../simple-factory-generator';
import {
  addStringProperty,
  addValueToObject,
  buildComponentFileName,
  codeExpression,
  convertJsonSchemaToZodSafe,
  toCamelCase,
} from '../utils';

const MySchema = FullProjectDefinitionSchema.shape.dataComponents.unwrap().valueType.omit({
  id: true,
});

const DataComponentSchema = z.strictObject({
  dataComponentId: z.string().nonempty(),
  ...MySchema.shape,
  description: z.preprocess((v) => v || undefined, MySchema.shape.description),
  // Each property must have a "description" for LLM compatibility
  props: z.unknown(),
});

type DataComponentInput = z.input<typeof DataComponentSchema>;
type DataComponentOutput = z.output<typeof DataComponentSchema>;

export function generateDataComponentDefinition({
  tenantId,
  id,
  projectId,
  createdAt,
  updatedAt,
  ...data
}: DataComponentInput & Record<string, unknown>): SourceFile {
  return generateFactorySourceFile(data, {
    schema: DataComponentSchema,
    factory: {
      importName: 'dataComponent',
      variableName: (parsed) => toCamelCase(parsed.dataComponentId),
    },
    render({ parsed, sourceFile, configObject }) {
      const props = parsed.props;
      if (props !== undefined) {
        sourceFile.addImportDeclaration({
          namedImports: ['z'],
          moduleSpecifier: 'zod',
        });
      }

      writeDataComponentConfig(configObject, parsed, props);
    },
  });
}

function writeDataComponentConfig(
  configObject: ObjectLiteralExpression,
  data: DataComponentOutput,
  props: unknown
): void {
  addStringProperty(configObject, 'id', data.dataComponentId);
  addStringProperty(configObject, 'name', data.name);

  if (typeof data.description === 'string') {
    addStringProperty(configObject, 'description', data.description);
  }

  if (props !== undefined) {
    addValueToObject(configObject, 'props', codeExpression(convertJsonSchemaToZodSafe(props)));
  }

  if (data.render) {
    addRenderProperty(configObject, data.render);
  }
}

function addRenderProperty(
  configObject: ObjectLiteralExpression,
  render: NonNullable<DataComponentOutput['render']>
): void {
  if (render.component) {
    addValueToObject(configObject, 'render', {
      component: render.component,
      mockData: render.mockData,
    });
  }
}

export const task = {
  type: 'data-component',
  collect(context) {
    const recordsByDataComponentId = new Map<
      string,
      ReturnType<
        GenerationTask<Parameters<typeof generateDataComponentDefinition>[0]>['collect']
      >[number]
    >();

    for (const [dataComponentId, dataComponent] of Object.entries(
      context.project.dataComponents ?? {}
    )) {
      recordsByDataComponentId.set(dataComponentId, {
        id: dataComponentId,
        filePath: context.resolver.resolveOutputFilePath(
          'dataComponents',
          dataComponentId,
          join(
            context.paths.dataComponentsDir,
            buildComponentFileName(dataComponentId, dataComponent.name ?? undefined)
          )
        ),
        payload: {
          dataComponentId,
          ...dataComponent,
        } as Parameters<typeof generateDataComponentDefinition>[0],
      });
    }

    for (const dataComponentId of collectReferencedSubAgentComponentIds(
      context,
      'dataComponents'
    )) {
      if (recordsByDataComponentId.has(dataComponentId)) {
        continue;
      }

      recordsByDataComponentId.set(dataComponentId, {
        id: dataComponentId,
        filePath: context.resolver.resolveOutputFilePath(
          'dataComponents',
          dataComponentId,
          join(context.paths.dataComponentsDir, `${dataComponentId}.ts`)
        ),
        payload: {
          dataComponentId,
          name: dataComponentId,
          props: { type: 'object', properties: {} },
        } as Parameters<typeof generateDataComponentDefinition>[0],
      });
    }

    return [...recordsByDataComponentId.values()];
  },
  generate: generateDataComponentDefinition,
} satisfies GenerationTask<Parameters<typeof generateDataComponentDefinition>[0]>;
