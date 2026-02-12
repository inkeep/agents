import type { ProjectConfig } from '@inkeep/agents-sdk';
import type { CodeBlockWriter } from 'ts-morph';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';

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

  const missingFields = getMissingRequiredFields(projectData);
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for project '${projectId}': ${missingFields.join(', ')}`
    );
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

  const sourceFile = project.createSourceFile('project-definition.ts', '', { overwrite: true });
  const projectVarName = toCamelCase(projectId);

  sourceFile.replaceWithText((writer) => {
    writeProjectDefinition(writer, projectVarName, projectId, projectData);
  });

  return sourceFile.getFullText().trimEnd();
}

function getMissingRequiredFields(projectData: ProjectDefinitionData): string[] {
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

  return missingFields;
}

function writeProjectDefinition(
  writer: CodeBlockWriter,
  projectVarName: string,
  projectId: string,
  projectData: ProjectDefinitionData
) {
  const hasAgents = Boolean(projectData.agents?.length);

  writer.writeLine(`export const ${projectVarName} = project({`);
  writer.indent(() => {
    writer.writeLine(`id: ${toLiteral(projectId)},`);
    writer.writeLine(`name: ${toLiteral(projectData.name ?? '')},`);

    if (projectData.description) {
      writer.writeLine(`description: ${toLiteral(projectData.description)},`);
    }

    writeModels(writer, projectData.models, hasAgents);

    if (hasAgents) {
      writer.writeLine('agents: () => [');
      writer.indent(() => {
        projectData.agents?.forEach((agentId, index) => {
          const isLast = index === (projectData.agents?.length ?? 0) - 1;
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

  const entries = Object.entries(value as Record<string, unknown>);
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
