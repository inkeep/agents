import type { ProjectConfig } from '@inkeep/agents-sdk';
import type { CodeBlockWriter } from 'ts-morph';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';
import { z } from 'zod';

type ProjectDefinitionData = Omit<ProjectConfig, 'id'> & {
  projectId: string;
  agents?: string[];
};

const ProjectSchema = z.looseObject({
  projectId: z.string().nonempty(),
  name: z.string().nonempty(),
  models: z.looseObject({
    base: z.looseObject({
      model: z.string().nonempty(),
    }),
  }),
});

export function generateProjectDefinition(data: ProjectDefinitionData): string {
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      newLineKind: NewLineKind.LineFeed,
      useTrailingCommas: false,
    },
  });

  const parsed = result.data;
  const sourceFile = project.createSourceFile('project-definition.ts', '', { overwrite: true });
  const projectVarName = toCamelCase(parsed.projectId);
  sourceFile.replaceWithText((writer) => {
    writeProjectDefinition(writer, projectVarName, parsed);
  });

  return sourceFile.getFullText().trimEnd();
}

function writeProjectDefinition(
  writer: CodeBlockWriter,
  projectVarName: string,
  { agents, projectId, description, models, name }: ProjectDefinitionData
) {
  const hasAgents = Boolean(agents?.length);

  writer.writeLine(`export const ${projectVarName} = project({`);
  writer.indent(() => {
    writer.writeLine(`id: ${toLiteral(projectId)},`);
    writer.writeLine(`name: ${toLiteral(name ?? '')},`);

    if (description) {
      writer.writeLine(`description: ${toLiteral(description)},`);
    }

    writeModels(writer, models, hasAgents);

    if (hasAgents) {
      writer.writeLine('agents: () => [');
      writer.indent(() => {
        agents?.forEach((agentId, index) => {
          const isLast = index === (agents?.length ?? 0) - 1;
          writer.writeLine(`${agentId}${isLast ? '' : ','}`);
        });
      });
      writer.writeLine(']');
    }
  });
  writer.write('});');
}

function writeModels(
  writer: CodeBlockWriter,
  models: NonNullable<ProjectDefinitionData['models']>,
  hasTrailingComma: boolean
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
      const isLast = index === definedEntries.length - 1;
      writer.writeLine(`${key}: ${toLiteral(value)}${isLast ? '' : ','}`);
    });
  });
  writer.writeLine(`}${hasTrailingComma ? ',' : ''}`);
}

function toLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
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
  if (Array.isArray(value)) {
    return `[${value.map((item) => toLiteral(item)).join(', ')}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '{}';
  }

  return `{ ${entries.map(([key, entryValue]) => `${key}: ${toLiteral(entryValue)}`).join(', ')} }`;
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
