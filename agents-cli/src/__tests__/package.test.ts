import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Package Configuration', () => {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const tsConfigTypeCheckPath = join(__dirname, '..', '..', 'tsconfig.typecheck.json');
  let packageJson: any;
  let tsConfigTypeCheck: any;

  beforeEach(() => {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(packageJsonContent);

    const tsConfigTypeCheckContent = readFileSync(tsConfigTypeCheckPath, 'utf-8');
    tsConfigTypeCheck = JSON.parse(tsConfigTypeCheckContent);
  });

  describe('package.json', () => {
    it('should have correct package name', () => {
      expect(packageJson.name).toBe('@inkeep/agents-cli');
    });

    it('should have a valid version', () => {
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have correct bin configuration', () => {
      expect(packageJson.bin).toEqual({
        inkeep: './dist/index.js',
      });
    });

    it('should have correct main entry point', () => {
      expect(packageJson.main).toBe('./dist/index.js');
    });

    it('should be set to module type', () => {
      expect(packageJson.type).toBe('module');
    });

    it('should have required dependencies', () => {
      expect(packageJson.dependencies).toHaveProperty('commander');
      expect(packageJson.dependencies).toHaveProperty('chalk');
    });

    it('should have required dev dependencies', () => {
      expect(packageJson.devDependencies).toHaveProperty('typescript');
      expect(packageJson.devDependencies).toHaveProperty('vitest');
      expect(packageJson.devDependencies).toHaveProperty('@types/node');
    });

    it('should have test scripts', () => {
      expect(packageJson.scripts).toHaveProperty('test');
      expect(packageJson.scripts).toHaveProperty('test:watch');
      expect(packageJson.scripts).toHaveProperty('test:coverage');
    });

    it('should have typecheck script', () => {
      expect(packageJson.scripts).toHaveProperty('typecheck');
      expect(packageJson.scripts.typecheck).toBe('tsc --noEmit --project tsconfig.typecheck.json');
    });

    it('should have correct Node.js engine requirement', () => {
      expect(packageJson.engines.node).toBe('>=22.0.0');
    });

    it('should have correct author', () => {
      expect(packageJson.author).toBe('Inkeep <support@inkeep.com>');
    });

    it('should have correct license reference', () => {
      expect(packageJson.license).toBe('SEE LICENSE IN LICENSE.md');
    });
  });

  describe('tsconfig.typecheck.json', () => {
    it('should extend base tsconfig', () => {
      expect(tsConfigTypeCheck.extends).toBe('./tsconfig.json');
    });

    it('should have correct compiler options', () => {
      expect(tsConfigTypeCheck.compilerOptions).toHaveProperty('noEmit', true);
      expect(tsConfigTypeCheck.compilerOptions).toHaveProperty('skipLibCheck', true);
    });

    it('should include src files', () => {
      expect(tsConfigTypeCheck.include).toContain('src/**/*');
    });

    it('should exclude test files and build artifacts', () => {
      expect(tsConfigTypeCheck.exclude).toContain('node_modules');
      expect(tsConfigTypeCheck.exclude).toContain('dist');
      expect(tsConfigTypeCheck.exclude).toContain('**/*.test.ts');
      expect(tsConfigTypeCheck.exclude).toContain('src/__tests__/**/*');
    });
  });
});
