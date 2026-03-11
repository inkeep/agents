#!/usr/bin/env node

/**
 * Check that route handlers use the spread pattern when forwarding validated
 * request bodies to DAL functions, rather than explicit field-picking.
 *
 * Usage: node scripts/check-route-handler-patterns.mjs
 *
 * Detects handlers that:
 * 1. Call c.req.valid('json') and assign the result to a variable
 * 2. Access that variable via $var.field in a DAL call
 * 3. Do NOT also spread the variable (...$var) in the same call
 *
 * Handlers can opt out with a `// allow-field-picking` comment on the line
 * containing the DAL call or the field access.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ROUTE_DIRS = [
  'agents-api/src/domains/manage/routes',
  'agents-api/src/domains/run/routes',
  'agents-api/src/domains/evals/routes',
];

function findRouteFiles() {
  const files = [];
  for (const dir of ROUTE_DIRS) {
    const fullDir = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(fullDir)) continue;
    const entries = fs.globSync('**/*.ts', { cwd: fullDir });
    for (const entry of entries) {
      files.push(path.join(dir, entry));
    }
  }
  return files.sort();
}

/**
 * Find all handler blocks that call c.req.valid('json') and extract the
 * variable name assigned to the validated body.
 */
function findValidatedBodyUsages(content, lines) {
  const validBodyPattern = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?c\.req\.valid\(\s*['"]json['"]\s*\)/g;
  const usages = [];
  let match;

  while ((match = validBodyPattern.exec(content)) !== null) {
    const varName = match[1];
    const lineNum = content.slice(0, match.index).split('\n').length;
    usages.push({ varName, lineNum, matchIndex: match.index });
  }

  return usages;
}

/**
 * Find the enclosing handler scope for a given index position.
 * Walks forward from the match to find the DAL call and checks for
 * field-picking vs spread patterns.
 */
function checkHandlerForFieldPicking(content, lines, varName, startLineNum) {
  const violations = [];

  // Find all object literals that reference $varName.field without also spreading $varName
  // We scan from the variable declaration to the next handler or end of file
  const startIndex = content.indexOf('\n', nthIndexOf(content, '\n', startLineNum - 1));
  const nextHandlerMatch = content.slice(startIndex + 1).search(/(?:const|let)\s+\w+\s*=\s*(?:await\s+)?c\.req\.valid\(/);
  const endIndex = nextHandlerMatch >= 0 ? startIndex + 1 + nextHandlerMatch : content.length;
  const handlerContent = content.slice(startIndex, endIndex);
  const handlerLines = handlerContent.split('\n');

  // Find object literals that reference body.field
  const fieldAccessPattern = new RegExp(`\\b${varName}\\.(\\w+)`, 'g');
  const spreadPattern = new RegExp(`\\.\\.\\.${varName}\\b`);

  // Find all object literal blocks ({ ... }) that contain field accesses
  // We need to check each DAL call / object literal separately
  let braceDepth = 0;
  let currentBlockStart = -1;
  let currentBlockContent = '';
  let blockStartLine = 0;

  for (let i = 0; i < handlerContent.length; i++) {
    const char = handlerContent[i];
    if (char === '{') {
      if (braceDepth === 0) {
        currentBlockStart = i;
        blockStartLine = handlerContent.slice(0, i).split('\n').length;
      }
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
      if (braceDepth === 0 && currentBlockStart >= 0) {
        currentBlockContent = handlerContent.slice(currentBlockStart, i + 1);

        // Check if this block has field accesses from the validated body
        const hasFieldAccess = fieldAccessPattern.test(currentBlockContent);
        fieldAccessPattern.lastIndex = 0;

        // Check if this block also has a spread of the validated body
        const hasSpread = spreadPattern.test(currentBlockContent);

        // Check for allowlist comment
        const blockLines = currentBlockContent.split('\n');
        const hasAllowComment = blockLines.some((line) =>
          line.includes('// allow-field-picking')
        );

        if (hasFieldAccess && !hasSpread && !hasAllowComment) {
          // Count field accesses to filter out single-access cases (e.g., body.id for conditionals)
          const fieldAccesses = [];
          let fieldMatch;
          while ((fieldMatch = fieldAccessPattern.exec(currentBlockContent)) !== null) {
            fieldAccesses.push(fieldMatch[1]);
          }
          fieldAccessPattern.lastIndex = 0;

          // Only flag if there are 2+ distinct field accesses (single access is often a conditional check)
          const uniqueFields = [...new Set(fieldAccesses)];
          if (uniqueFields.length >= 2) {
            const absoluteLine = startLineNum + blockStartLine - 1;
            violations.push({
              line: absoluteLine,
              fields: uniqueFields,
              varName,
            });
          }
        }

        currentBlockStart = -1;
        currentBlockContent = '';
      }
    }
  }

  return violations;
}

function nthIndexOf(str, substr, n) {
  let index = -1;
  for (let i = 0; i < n; i++) {
    index = str.indexOf(substr, index + 1);
    if (index === -1) return str.length;
  }
  return index;
}

function main() {
  console.log('Checking route handler patterns...\n');

  const routeFiles = findRouteFiles();

  if (routeFiles.length === 0) {
    console.error('❌ No route files found to check!');
    process.exit(1);
  }

  let totalViolations = 0;
  const allViolations = [];

  for (const relativeFile of routeFiles) {
    const filePath = path.join(ROOT_DIR, relativeFile);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check for file-level allowlist
    if (content.includes('// allow-field-picking-file')) continue;

    const usages = findValidatedBodyUsages(content, lines);
    if (usages.length === 0) continue;

    const fileViolations = [];

    for (const usage of usages) {
      const violations = checkHandlerForFieldPicking(
        content,
        lines,
        usage.varName,
        usage.lineNum
      );
      fileViolations.push(...violations);
    }

    if (fileViolations.length > 0) {
      totalViolations += fileViolations.length;
      allViolations.push({ file: relativeFile, violations: fileViolations });
    }
  }

  console.log(`Scanned ${routeFiles.length} route files.\n`);

  if (totalViolations === 0) {
    console.log('✅ All route handlers use the spread pattern correctly.');
    process.exit(0);
  }

  console.log(`❌ Found ${totalViolations} handler(s) using explicit field-picking:\n`);

  for (const { file, violations } of allViolations) {
    for (const v of violations) {
      console.log(`  ${file}:${v.line}`);
      console.log(`    Variable '${v.varName}' accessed via field-picking: ${v.fields.join(', ')}`);
      console.log(`    Fix: Use { ...${v.varName}, <overrides> } instead of picking individual fields`);
      console.log('');
    }
  }

  console.log('To fix:');
  console.log('  Replace explicit field-picking with spread pattern:');
  console.log('    ❌  { name: body.name, description: body.description }');
  console.log('    ✅  { ...body, id: body.id || generateId() }');
  console.log('');
  console.log('  To allowlist a specific handler, add: // allow-field-picking');
  console.log('  To allowlist an entire file, add: // allow-field-picking-file');

  process.exit(1);
}

main();
