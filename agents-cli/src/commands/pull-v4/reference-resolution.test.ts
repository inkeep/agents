import {
  addResolvedReferenceImports,
  resolveReferenceBinding,
  resolveReferenceBindings,
  resolveReferenceBindingsFromIds,
  toReferenceNameRecord,
} from './reference-resolution';
import { createInMemoryProject } from './utils';

describe('reference-resolution', () => {
  it('keeps local overrides unimported', () => {
    const reference = resolveReferenceBinding(
      {
        id: 'context',
        importName: 'sharedContext',
        modulePath: 'context-config',
        local: true,
      },
      {
        reservedNames: new Set(['subAgent']),
      }
    );

    expect(reference.isLocal).toBe(true);
    expect(reference.localName).toBe('sharedContext');
    expect(reference.namedImport).toBeUndefined();
  });

  it('uses numeric aliases for duplicate import names when requested', () => {
    const references = resolveReferenceBindingsFromIds({
      ids: ['tool-a', 'tool-b'],
      reservedNames: new Set(['subAgent']),
      conflictSuffix: 'Tool',
      collisionStrategy: 'numeric-for-duplicates',
      referenceOverrides: {
        'tool-a': 'searchTool',
        'tool-b': 'searchTool',
      },
      defaultModulePath: (id) => id,
    });

    expect(references.map((reference) => reference.localName)).toEqual([
      'searchTool',
      'searchTool1',
    ]);
  });

  it('returns resolved local names by id', () => {
    const references = resolveReferenceBindingsFromIds({
      ids: ['agent-a', 'agent-b'],
      reservedNames: new Set(['project', 'assistantAgent']),
      conflictSuffix: 'Agent',
      referenceOverrides: {
        'agent-a': 'assistantAgent',
        'agent-b': 'assistantAgent',
      },
      referencePathOverrides: {
        'agent-a': 'agents/assistant-agent.ts',
        'agent-b': 'agents/assistant-agent-2.ts',
      },
    });

    expect(toReferenceNameRecord(references)).toEqual({
      'agent-a': 'assistantAgentAgent',
      'agent-b': 'assistantAgentAgent2',
    });
    expect(references.map((reference) => reference.modulePath)).toEqual([
      'agents/assistant-agent',
      'agents/assistant-agent-2',
    ]);
  });

  it('preserves import alias collisions when writing imports', () => {
    const references = resolveReferenceBindings(
      [
        {
          id: 'agent-a',
          importName: 'sharedAgent',
          modulePath: 'agents/shared-agent',
        },
        {
          id: 'agent-b',
          importName: 'sharedAgent',
          modulePath: 'agents/shared-agent-2',
        },
      ],
      {
        reservedNames: new Set(['sharedAgent']),
        conflictSuffix: 'Agent',
      }
    );

    const sourceFile = createInMemoryProject().createSourceFile('test.ts', '', {
      overwrite: true,
    });
    addResolvedReferenceImports(sourceFile, references, (reference) => {
      return `./${reference.modulePath}`;
    });

    const fileText = sourceFile.getFullText();
    expect(fileText).toContain(
      "import { sharedAgent as sharedAgentAgent } from './agents/shared-agent';"
    );
    expect(fileText).toContain(
      "import { sharedAgent as sharedAgentAgent2 } from './agents/shared-agent-2';"
    );
  });
});
