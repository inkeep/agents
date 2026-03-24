import { join } from 'node:path';
import type { SourceFile } from 'ts-morph';
import { z } from 'zod';
import { collectEnvironmentCredentialReferenceIds } from '../collector-common';
import type { GenerationTask } from '../generation-types';
import { generateFactorySourceFile } from '../simple-factory-generator';

const EnvironmentIndexSchema = z.array(z.string());

type EnvironmentIndexInput = z.input<typeof EnvironmentIndexSchema>;

export function generateEnvironmentIndexDefinition(
  environments: EnvironmentIndexInput
): SourceFile {
  return generateFactorySourceFile(environments, {
    schema: EnvironmentIndexSchema,
    factory: {
      importName: 'createEnvironmentSettings',
      variableName: () => 'envSettings',
    },
    render({ parsed, sourceFile, configObject }) {
      for (const environmentName of parsed) {
        sourceFile.addImportDeclaration({
          namedImports: [environmentName],
          moduleSpecifier: `./${environmentName}.env`,
        });
      }

      for (const environmentName of parsed) {
        configObject.addShorthandPropertyAssignment({ name: environmentName });
      }
    },
  });
}

export const task = {
  type: 'environment-index',
  collect(context) {
    const credentialReferenceIds = collectEnvironmentCredentialReferenceIds(context.project);
    if (credentialReferenceIds.length === 0) {
      return [];
    }

    return [
      {
        id: 'index',
        filePath: context.resolver.resolveOutputFilePath(
          'environments',
          'index',
          join(context.paths.environmentsDir, 'index.ts')
        ),
        payload: ['development'] as Parameters<typeof generateEnvironmentIndexDefinition>[0],
      },
    ];
  },
  generate: generateEnvironmentIndexDefinition,
} satisfies GenerationTask<Parameters<typeof generateEnvironmentIndexDefinition>[0]>;
