import { describe, expect, it } from 'vitest';
import {
  autoDetectDependencies,
  collectDepsFromCode,
  createLatestDependencies,
} from '../detectDependencies';

describe('detectDependencies', () => {
  describe('collectDepsFromCode', () => {
    it('should detect CommonJS require dependencies', () => {
      const code = `
        const axios = require('axios');
        const lodash = require('lodash');
        const fs = require('fs'); // Built-in, should be ignored
      `;

      const deps = collectDepsFromCode(code);

      expect(deps).toContain('axios');
      expect(deps).toContain('lodash');
      expect(deps).not.toContain('fs'); // Built-in modules should be excluded
    });

    it('should detect ES6 import dependencies', () => {
      const code = `
        import axios from 'axios';
        import { get } from 'lodash';
        import path from 'path'; // Built-in, should be ignored
      `;

      const deps = collectDepsFromCode(code);

      expect(deps).toContain('axios');
      expect(deps).toContain('lodash');
      expect(deps).not.toContain('path'); // Built-in modules should be excluded
    });

    it('should detect dynamic import dependencies', () => {
      const code = `
        const axios = await import('axios');
        const pkg = await import('@scope/package');
      `;

      const deps = collectDepsFromCode(code);

      expect(deps).toContain('axios');
      expect(deps).toContain('@scope/package');
    });

    it('should collapse subpath imports', () => {
      const code = `
        const get = require('lodash/get');
        const utils = require('@babel/utils');
      `;

      const deps = collectDepsFromCode(code);

      expect(deps).toContain('lodash'); // Should collapse lodash/get to lodash
      expect(deps).toContain('@babel/utils'); // Should keep full scoped package name
    });

    it('should ignore relative imports', () => {
      const code = `
        const local = require('./local-file');
        const relative = require('../relative-file');
        const absolute = require('/absolute/path');
      `;

      const deps = collectDepsFromCode(code);

      expect(deps.size).toBe(0); // No external dependencies
    });
  });

  describe('createLatestDependencies', () => {
    it('should map dependencies to "latest" versions', () => {
      const deps = new Set(['axios', 'lodash', '@babel/core']);

      const result = createLatestDependencies(deps);

      expect(result).toEqual({
        axios: 'latest',
        lodash: 'latest',
        '@babel/core': 'latest',
      });
    });
  });

  describe('autoDetectDependencies', () => {
    it('should auto-detect and map to latest versions', () => {
      const code = `
        const axios = require('axios');
        const { debounce } = require('lodash');
        
        async function fetchData() {
          return await axios.get('https://api.example.com');
        }
      `;

      const result = autoDetectDependencies(code);

      expect(result).toEqual({
        axios: 'latest',
        lodash: 'latest',
      });
    });

    it('should return empty object for code with no dependencies', () => {
      const code = `
        const fs = require('fs'); // Built-in
        const path = require('path'); // Built-in
        
        function processFile(filename) {
          return fs.readFileSync(path.join(__dirname, filename), 'utf8');
        }
      `;

      const result = autoDetectDependencies(code);

      expect(result).toEqual({});
    });
  });
});
