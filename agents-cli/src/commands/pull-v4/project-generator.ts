import type { ProjectConfig } from '@inkeep/agents-sdk';
import type { CodeBlockWriter } from 'ts-morph';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';
import { z } from 'zod';

type ProjectDefinitionData = Omit<
  ProjectConfig,
  | 'id'
  | 'agents'
  | 'tools'
  | 'externalAgents'
  | 'dataComponents'
  | 'artifactComponents'
  | 'credentialReferences'
> & {
  projectId: string;
  agents?: string[];
  tools?: string[];
  externalAgents?: string[];
  dataComponents?: string[];
  artifactComponents?: string[];
  credentialReferences?: string[];
};

const ProjectSchema = z.looseObject({
  projectId: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  models: z.looseObject({
    base: z.looseObject({
      model: z.string().nonempty(),
    }),
    structuredOutput: z.looseObject({}).optional(),
    summarizer: z.looseObject({}).optional(),
  }),
  stopWhen: z
    .object({
      transferCountIs: z.int().optional(),
      stepCountIs: z.int().optional(),
    })
    .optional(),
  agents: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  externalAgents: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  credentialReferences: z.array(z.string()).optional(),
});

type SectionWriter = (writer: CodeBlockWriter, hasTrailingComma: boolean) => void;

export function generateProjectDefinition(data: ProjectDefinitionData): string {
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Missing required fields for project:
${z.prettifyError(result.error)}`);
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
  {
    agents,
    artifactComponents,
    credentialReferences,
    dataComponents,
    description,
    externalAgents,
    models,
    name,
    projectId,
    stopWhen,
    tools,
  }: ProjectDefinitionData
) {
  const sections: SectionWriter[] = [];

  sections.push((lineWriter, hasTrailingComma) => {
    lineWriter.writeLine(`id: ${toLiteral(projectId)}${hasTrailingComma ? ',' : ''}`);
  });
  sections.push((lineWriter, hasTrailingComma) => {
    lineWriter.writeLine(`name: ${toLiteral(name ?? '')}${hasTrailingComma ? ',' : ''}`);
  });

  if (description) {
    sections.push((lineWriter, hasTrailingComma) => {
      lineWriter.writeLine(`description: ${toLiteral(description)}${hasTrailingComma ? ',' : ''}`);
    });
  }

  sections.push((lineWriter, hasTrailingComma) => {
    writeModels(lineWriter, models, hasTrailingComma);
  });

  if (hasStopWhen(stopWhen)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeStopWhen(lineWriter, stopWhen, hasTrailingComma);
    });
  }

  if (hasReferences(agents)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(lineWriter, 'agents', agents, hasTrailingComma);
    });
  }

  if (hasReferences(tools)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(lineWriter, 'tools', tools, hasTrailingComma);
    });
  }

  if (hasReferences(externalAgents)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(lineWriter, 'externalAgents', externalAgents, hasTrailingComma);
    });
  }

  if (hasReferences(dataComponents)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(lineWriter, 'dataComponents', dataComponents, hasTrailingComma);
    });
  }

  if (hasReferences(artifactComponents)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(lineWriter, 'artifactComponents', artifactComponents, hasTrailingComma);
    });
  }

  if (hasReferences(credentialReferences)) {
    sections.push((lineWriter, hasTrailingComma) => {
      writeReferenceSection(
        lineWriter,
        'credentialReferences',
        credentialReferences,
        hasTrailingComma
      );
    });
  }

  writer.writeLine(`export const ${projectVarName} = project({`);
  writer.indent(() => {
    for (const [index, section] of sections.entries()) {
      section(writer, index < sections.length - 1);
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

    for (const [index, [key, value]] of definedEntries.entries()) {
      const isLast = index === definedEntries.length - 1;
      writer.writeLine(`${key}: ${toLiteral(value)}${isLast ? '' : ','}`);
    }
  });
  writer.writeLine(`}${hasTrailingComma ? ',' : ''}`);
}

function writeStopWhen(
  writer: CodeBlockWriter,
  stopWhen: NonNullable<ProjectDefinitionData['stopWhen']>,
  hasTrailingComma: boolean
) {
  writer.writeLine('stopWhen: {');
  writer.indent(() => {
    const entries: Array<[string, number]> = [];
    if (stopWhen.transferCountIs !== undefined) {
      entries.push(['transferCountIs', stopWhen.transferCountIs]);
    }
    if (stopWhen.stepCountIs !== undefined) {
      entries.push(['stepCountIs', stopWhen.stepCountIs]);
    }
    for (const [index, [key, value]] of entries.entries()) {
      const isLast = index === entries.length - 1;
      writer.writeLine(`${key}: ${value}${isLast ? '' : ','}`);
    }
  });
  writer.writeLine(`}${hasTrailingComma ? ',' : ''}`);
}

function writeReferenceSection(
  writer: CodeBlockWriter,
  key: string,
  refs: string[],
  hasTrailingComma: boolean
) {
  if (refs.length === 1) {
    writer.writeLine(`${key}: () => [${refs[0]}]${hasTrailingComma ? ',' : ''}`);
    return;
  }

  writer.writeLine(`${key}: () => [`);
  writer.indent(() => {
    for (const [index, item] of refs.entries()) {
      const isLast = index === refs.length - 1;
      writer.writeLine(`${item}${isLast ? '' : ','}`);
    }
  });
  writer.writeLine(`]${hasTrailingComma ? ',' : ''}`);
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

function hasStopWhen(
  stopWhen: ProjectDefinitionData['stopWhen']
): stopWhen is NonNullable<ProjectDefinitionData['stopWhen']> {
  if (!stopWhen) {
    return false;
  }
  return stopWhen.transferCountIs !== undefined || stopWhen.stepCountIs !== undefined;
}

function hasReferences(references?: string[]): references is string[] {
  return Array.isArray(references) && references.length > 0;
}
