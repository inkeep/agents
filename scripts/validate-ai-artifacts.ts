#!/usr/bin/env tsx
/**
 * Validates YAML frontmatter in Claude Code agent and skill definition files.
 *
 * Catches broken frontmatter that silently prevents Claude Code from discovering
 * agents/skills at runtime. Common failure: unindented content inside `description: |`
 * block scalars (e.g., <example> blocks at column 0).
 *
 * Usage:
 *   pnpm validate:ai-artifacts          # validate all agents + skills
 *   tsx scripts/validate-ai-artifacts.ts # same thing
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';

interface ValidationResult {
  file: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

function extractFrontmatter(content: string): { raw: string; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return { raw: match[1], body: content.slice(match[0].length) };
}

function validateAgentFile(filePath: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const fm = extractFrontmatter(content);

  if (!fm) {
    results.push({
      file: filePath,
      status: 'error',
      message: 'No YAML frontmatter delimiters (---) found',
    });
    return results;
  }

  let data: Record<string, unknown>;
  try {
    data = parse(fm.raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ file: filePath, status: 'error', message: `Invalid YAML frontmatter: ${msg}` });
    return results;
  }

  if (!data || typeof data !== 'object') {
    results.push({
      file: filePath,
      status: 'error',
      message: `Frontmatter parsed as ${typeof data}, expected object`,
    });
    return results;
  }

  if (!('name' in data)) {
    results.push({ file: filePath, status: 'error', message: 'Missing required "name" field' });
  }

  if (!('description' in data)) {
    results.push({
      file: filePath,
      status: 'error',
      message: 'Missing required "description" field',
    });
  }

  if ('name' in data) {
    const expectedName = basename(filePath, '.md');
    if (data.name !== expectedName) {
      results.push({
        file: filePath,
        status: 'warning',
        message: `name "${data.name}" does not match filename "${expectedName}"`,
      });
    }
  }

  if ('description' in data && typeof data.description === 'string') {
    if (data.description.trim().length === 0) {
      results.push({ file: filePath, status: 'warning', message: 'description is empty' });
    }
  }

  if (results.length === 0) {
    results.push({ file: filePath, status: 'ok', message: `name=${data.name}` });
  }

  return results;
}

function validateSkillFile(filePath: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const fm = extractFrontmatter(content);

  if (!fm) {
    results.push({
      file: filePath,
      status: 'error',
      message: 'No YAML frontmatter delimiters (---) found',
    });
    return results;
  }

  let data: Record<string, unknown>;
  try {
    data = parse(fm.raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ file: filePath, status: 'error', message: `Invalid YAML frontmatter: ${msg}` });
    return results;
  }

  if (!data || typeof data !== 'object') {
    results.push({
      file: filePath,
      status: 'error',
      message: `Frontmatter parsed as ${typeof data}, expected object`,
    });
    return results;
  }

  if (!('name' in data)) {
    results.push({ file: filePath, status: 'error', message: 'Missing required "name" field' });
  }

  if (!('description' in data)) {
    results.push({
      file: filePath,
      status: 'error',
      message: 'Missing required "description" field',
    });
  }

  if ('name' in data) {
    const expectedName = basename(dirname(filePath));
    if (data.name !== expectedName) {
      results.push({
        file: filePath,
        status: 'warning',
        message: `name "${data.name}" does not match directory name "${expectedName}"`,
      });
    }
  }

  if (results.length === 0) {
    results.push({ file: filePath, status: 'ok', message: `name=${data.name}` });
  }

  return results;
}

function findAgentFiles(): string[] {
  const dir = '.claude/agents';
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(dir, f))
    .sort();
}

function findSkillFiles(): string[] {
  const skillDirs = ['.agents/skills', '.claude/skills', '.cursor/skills'];
  const files: string[] = [];

  for (const skillsDir of skillDirs) {
    if (!existsSync(skillsDir)) continue;
    for (const subdir of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!subdir.isDirectory()) continue;
      const skillPath = join(skillsDir, subdir.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        files.push(skillPath);
      }
    }
  }

  return files.sort();
}

function main() {
  const allResults: ValidationResult[] = [];
  let errors = 0;
  let warnings = 0;

  const agents = findAgentFiles();
  const skills = findSkillFiles();

  console.log(`Validating ${agents.length} agent files and ${skills.length} skill files...\n`);

  for (const file of agents) {
    const results = validateAgentFile(file);
    allResults.push(...results);
  }

  for (const file of skills) {
    const results = validateSkillFile(file);
    allResults.push(...results);
  }

  for (const r of allResults) {
    if (r.status === 'error') {
      console.log(`FAIL ${r.file}: ${r.message}`);
      errors++;
    } else if (r.status === 'warning') {
      console.log(`WARN ${r.file}: ${r.message}`);
      warnings++;
    }
  }

  const total = agents.length + skills.length;

  if (errors > 0) {
    console.log(`\nFAILED: ${errors} error(s) in ${total} files`);
    console.log(
      "\nCommon fix: ensure all content inside 'description: |' is indented by at least 2 spaces."
    );
    console.log('Lines at column 0 (like <example>, <commentary>) break the YAML block scalar.');
    process.exit(1);
  }

  if (warnings > 0) {
    console.log(`\nAll valid with ${warnings} warning(s) across ${total} files`);
  } else {
    console.log(`\nAll ${total} files have valid frontmatter`);
  }
}

main();
