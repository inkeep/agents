import { addNamedImports, applyImportPlan, createImportPlan } from './import-plan';
import { createInMemoryProject } from './utils';

describe('import-plan', () => {
  it('groups and deduplicates named imports by module', () => {
    const importPlan = createImportPlan();
    addNamedImports(importPlan, './credentials/weather-api-credentials', 'weatherApiCredentials');
    addNamedImports(importPlan, './credentials/weather-api-credentials', 'weatherApiCredentials');
    addNamedImports(importPlan, './credentials/weather-api-credentials', {
      name: 'weatherApiCredentials',
      alias: 'weatherApiCredentials1',
    });
    addNamedImports(importPlan, 'zod', 'z');

    const sourceFile = createInMemoryProject().createSourceFile('test.ts', '', {
      overwrite: true,
    });
    applyImportPlan(sourceFile, importPlan);

    const importDeclarations = sourceFile.getImportDeclarations();
    expect(importDeclarations).toHaveLength(2);
    expect(importDeclarations[0]?.getModuleSpecifierValue()).toBe(
      './credentials/weather-api-credentials'
    );
    expect(
      importDeclarations[0]?.getNamedImports().map((namedImport) => namedImport.getText())
    ).toEqual(['weatherApiCredentials', 'weatherApiCredentials as weatherApiCredentials1']);
    expect(importDeclarations[1]?.getModuleSpecifierValue()).toBe('zod');
    expect(
      importDeclarations[1]?.getNamedImports().map((namedImport) => namedImport.getText())
    ).toEqual(['z']);
  });
});
