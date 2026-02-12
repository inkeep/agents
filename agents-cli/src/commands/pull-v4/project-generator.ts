import type { ProjectConfig } from '@inkeep/agents-sdk';
import type { CodeBlockWriter } from 'ts-morph';
import {
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  VariableDeclarationKind,
} from 'ts-morph';

type ProjectDefinitionData = Omit<ProjectConfig, 'id'> & {
  agents?: string[];
};

export function generateProjectDefinition(
  projectId: string,
  projectData: ProjectDefinitionData
): string {
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('projectId is required and must be a string');
  }

  if (!projectData || typeof projectData !== 'object') {
    throw new Error(`projectData is required for project '${projectId}'`);
  }

  const missingFields: string[] = [];
  if (!projectData.name) {
    missingFields.push('name');
  }
  if (!projectData.models) {
    missingFields.push('models');
  }
  if (!projectData.models?.base) {
    missingFields.push('models.base');
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for project '${projectId}': ${missingFields.join(', ')}`
    );
  }

  const morphProject = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });

  const sourceFile = morphProject.createSourceFile('project-definition.ts', '', {
    overwrite: true,
  });
  const projectVarName = toCamelCase(projectId);

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: projectVarName,
        initializer: (writer) => {
          writeProjectCall(writer, projectId, projectData);
        },
      },
    ],
  });

  return sourceFile.getFullText().trimEnd();
}

function writeProjectCall(
  writer: CodeBlockWriter,
  projectId: string,
  projectData: ProjectDefinitionData
) {
  writer.write('project(');
  writer.block(() => {
    writer.writeLine(`id: ${stringLiteral(projectId)},`);
    writer.writeLine(`name: ${stringLiteral(projectData.name || '')},`);

    if (projectData.description) {
      writer.writeLine(`description: ${stringLiteral(projectData.description)},`);
    }

    writeModels(writer, projectData.models);

    if (projectData.agents && projectData.agents.length > 0) {
      writer.write('agents: () => ');
      writeIdentifierArray(writer, projectData.agents);
      writer.newLine();
    }
  });
  writer.write(')');
}

function writeModels(
  writer: CodeBlockWriter,
  models: NonNullable<ProjectDefinitionData['models']>
) {
  writer.writeLine('models: {');
  writer.indent(() => {
    const orderedEntries = [
      ['base', models.base],
      ['structuredOutput', models.structuredOutput],
      ['summarizer', models.summarizer],
    ] as const;

    const definedEntries = orderedEntries.filter(([, value]) => value != null);

    definedEntries.forEach(([key, value], index) => {
      const hasNext = index < definedEntries.length - 1;
      writeModelSettings(writer, key, value ?? {}, hasNext);
    });
  });
  writer.writeLine('},');
}

function writeModelSettings(
  writer: CodeBlockWriter,
  key: string,
  settings: Record<string, unknown>,
  hasTrailingComma: boolean
) {
  writer.writeLine(`${key}: {`);
  writer.indent(() => {
    const entries = Object.entries(settings);
    entries.forEach(([entryKey, entryValue], index) => {
      const isLast = index === entries.length - 1;
      writer.writeLine(`${entryKey}: ${toLiteral(entryValue)}${isLast ? '' : ','}`);
    });
  });
  writer.writeLine(`}${hasTrailingComma ? ',' : ''}`);
}

function writeIdentifierArray(writer: CodeBlockWriter, ids: string[]) {
  writer.writeLine('[');
  writer.indent(() => {
    ids.forEach((id, index) => {
      const isLast = index === ids.length - 1;
      writer.writeLine(`${id}${isLast ? '' : ','}`);
    });
  });
  writer.write(']');
}

function toLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return stringLiteral(value);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value, null, 2);
}

function stringLiteral(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function toCamelCase(input: string): string {
  const parts = input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'projectDefinition';
  }

  const [first, ...rest] = parts;
  return (
    first.toLowerCase() +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('')
  );
}
