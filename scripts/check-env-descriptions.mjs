#!/usr/bin/env node

/**
 * Check that all environment variables in env.ts files have .describe() calls.
 *
 * Usage: node scripts/check-env-descriptions.mjs
 *
 * This script ensures consistency between .env.example documentation and
 * the Zod schema descriptions in env.ts files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Dynamically discover env.ts files, excluding:
// - node_modules
// - Auto-generated Speakeasy SDK files (agents-mcp, agents-manage-mcp)
// - dist/build directories
const ENV_FILES = fs
  .globSync('**/env.ts', {
    cwd: ROOT_DIR,
    exclude: (name) => {
      return (
        name.includes('node_modules') ||
        name.includes('agents-mcp') ||
        name.includes('agents-manage-mcp') ||
        name.includes('/dist/') ||
        name.includes('/build/')
      );
    },
  })
  .sort();

/**
 * Find matching closing brace for z.object({ content, handling nested braces
 */
function findSchemaContent(content, startIndex) {
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let schemaStart = -1;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle string detection (skip content inside strings)
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (schemaStart === -1) schemaStart = i + 1;
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        return content.slice(schemaStart, i);
      }
    }
  }

  return null;
}

/**
 * Parse an env.ts file and extract variable names and whether they have .describe()
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = [];

  // Find z.object( and then extract the schema content
  const schemaStartMatch = content.match(/z\.object\s*\(/);
  if (!schemaStartMatch) {
    return { error: 'Could not find z.object() schema', results: [] };
  }

  const schemaContent = findSchemaContent(content, schemaStartMatch.index);
  if (!schemaContent) {
    return { error: 'Could not parse z.object() schema content', results: [] };
  }

  // Use regex to find all variable definitions
  // Pattern matches: VARIABLE_NAME: z. (possibly with newline between : and z.)
  // Then capture everything until we see another variable or end of schema
  const varStartRegex = /([A-Z][A-Z0-9_]*)\s*:\s*z\s*\./g;
  const varStarts = [];
  let match;

  while ((match = varStartRegex.exec(schemaContent)) !== null) {
    varStarts.push({
      name: match[1],
      index: match.index,
    });
  }

  // For each variable, extract its full definition
  for (let i = 0; i < varStarts.length; i++) {
    const varStart = varStarts[i];
    const nextVarStart = varStarts[i + 1];

    // Extract the definition from this variable to the next (or end)
    const endIndex = nextVarStart ? nextVarStart.index : schemaContent.length;
    const definition = schemaContent.slice(varStart.index, endIndex);

    // Check if it has .describe()
    const hasDescribe = /\.describe\s*\(/.test(definition);

    // Extract description if present
    let description = null;
    if (hasDescribe) {
      const descMatch = definition.match(/\.describe\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/);
      if (descMatch) {
        description = descMatch[2];
      }
    }

    results.push({
      name: varStart.name,
      hasDescribe,
      description,
    });
  }

  return { error: null, results };
}

/**
 * Parse .env.example and extract variable names with their comments
 */
function parseEnvExample(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results = new Map();

  let currentComment = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) {
      // It's a comment - accumulate for the next variable
      const commentText = trimmed.slice(1).trim();
      // Skip section headers (lines with === or all caps section names)
      if (!commentText.includes('===') && commentText.length > 0) {
        currentComment.push(commentText);
      }
    } else if (trimmed.includes('=') && !trimmed.startsWith('#')) {
      // It's a variable definition
      const varName = trimmed.split('=')[0].trim();
      if (varName && /^[A-Z][A-Z0-9_]*$/.test(varName)) {
        results.set(varName, {
          name: varName,
          comment: currentComment.join(' '),
        });
      }
      currentComment = [];
    } else if (trimmed === '') {
      // Empty line - reset comment accumulator
      currentComment = [];
    }
  }

  return results;
}

function main() {
  console.log('Checking environment variable descriptions...\n');

  let hasErrors = false;
  let hasParseErrors = false;
  const parseErrors = [];

  // Parse .env.example for reference (if it exists)
  const envExamplePath = path.join(ROOT_DIR, '.env.example');
  let envExampleVars = new Map();
  if (fs.existsSync(envExamplePath)) {
    envExampleVars = parseEnvExample(envExamplePath);
  }

  if (ENV_FILES.length === 0) {
    console.error('❌ No env.ts files found to check!');
    process.exit(1);
  }

  for (const envFile of ENV_FILES) {
    const filePath = path.join(ROOT_DIR, envFile);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${envFile}`);
      hasParseErrors = true;
      parseErrors.push({ file: envFile, error: 'File not found' });
      continue;
    }

    console.log(`Checking ${envFile}...`);

    const { error, results: variables } = parseEnvFile(filePath);

    if (error) {
      console.error(`  ❌ Parse error: ${error}`);
      hasParseErrors = true;
      parseErrors.push({ file: envFile, error });
      continue;
    }

    if (variables.length === 0) {
      console.error(`  ❌ No variables found in schema (file may have unexpected structure)`);
      hasParseErrors = true;
      parseErrors.push({ file: envFile, error: 'No variables found in schema' });
      continue;
    }

    const missingDescriptions = variables.filter((v) => !v.hasDescribe);
    const emptyDescriptions = variables.filter(
      (v) => v.hasDescribe && (!v.description || v.description.trim() === '')
    );

    if (missingDescriptions.length === 0 && emptyDescriptions.length === 0) {
      console.log(`  ✅ All ${variables.length} variables have descriptions`);
    } else {
      hasErrors = true;

      if (missingDescriptions.length > 0) {
        console.log(`  ❌ ${missingDescriptions.length} variables missing .describe():`);
        for (const v of missingDescriptions) {
          console.log(`     - ${v.name}`);

          // Suggest description from .env.example if available
          const envExampleVar = envExampleVars.get(v.name);
          if (envExampleVar && envExampleVar.comment) {
            console.log(`       Suggestion from .env.example: "${envExampleVar.comment}"`);
          }
        }
      }

      if (emptyDescriptions.length > 0) {
        console.log(`  ❌ ${emptyDescriptions.length} variables have empty descriptions:`);
        for (const v of emptyDescriptions) {
          console.log(`     - ${v.name}`);
        }
      }
    }

    console.log('');
  }

  // Summary
  console.log('─'.repeat(60));

  if (hasParseErrors) {
    console.log('\n❌ Check failed: Could not parse some env.ts files.');
    console.log('\nParse errors:');
    for (const { file, error } of parseErrors) {
      console.log(`  - ${file}: ${error}`);
    }
    console.log('\nThis may indicate:');
    console.log('- The file has an unexpected structure');
    console.log('- The z.object() schema is missing or malformed');
    console.log('- The file was moved or deleted');
    process.exit(1);
  }

  if (hasErrors) {
    console.log('\n❌ Check failed: Some environment variables are missing descriptions.');
    console.log('\nTo fix this:');
    console.log('1. Add .describe() to each variable in the Zod schema');
    console.log('2. Ensure descriptions are meaningful and match .env.example comments');
    console.log('\nExample:');
    console.log("  ANTHROPIC_API_KEY: z.string().describe('Anthropic API key for Claude models'),");
    console.log('\nSee .agents/skills/adding-env-variables/SKILL.md for guidelines.');
    process.exit(1);
  }

  console.log('\n✅ All environment variables have descriptions.');
  process.exit(0);
}

main();
