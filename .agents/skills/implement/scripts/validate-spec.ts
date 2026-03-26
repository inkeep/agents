#!/usr/bin/env bun

// spec.json schema validator — zero dependencies.
// Usage: bun validate-spec.ts <path-to-spec.json>
// Exit 0: valid | Exit 1: invalid or error
//
// Used in two places:
// 1. Phase 2 — validate spec.json before crafting the prompt
// 2. implement.sh — validate spec.json integrity after each iteration

import { readFileSync } from 'fs';

// --- Type definitions ---

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes: string;
}

interface SpecJson {
  project: string;
  branchName: string;
  description: string;
  implementationContext: string;
  userStories: UserStory[];
}

// --- Validation helpers ---

function requireString(obj: Record<string, unknown>, field: string, label: string): string | null {
  const val = obj[field];
  if (typeof val !== 'string') return `${label}: must be a string (got ${typeof val})`;
  if (val.length === 0) return `${label}: must not be empty`;
  return null;
}

function validateStory(raw: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `userStories[${index}]`;

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return [`${prefix}: must be an object`];
  }

  const story = raw as Record<string, unknown>;

  // id — must match US-NNN
  if (typeof story.id !== 'string') {
    errors.push(`${prefix}.id: must be a string (got ${typeof story.id})`);
  } else if (!/^US-\d{3}$/.test(story.id)) {
    errors.push(`${prefix}.id: must match US-NNN format (e.g., US-001), got "${story.id}"`);
  }

  // Required string fields
  for (const field of ['title', 'description'] as const) {
    const err = requireString(story, field, `${prefix}.${field}`);
    if (err) errors.push(err);
  }

  // notes — must be a string (can be empty)
  if (typeof story.notes !== 'string') {
    errors.push(`${prefix}.notes: must be a string (got ${typeof story.notes})`);
  }

  // acceptanceCriteria — non-empty array of non-empty strings
  if (!Array.isArray(story.acceptanceCriteria)) {
    errors.push(`${prefix}.acceptanceCriteria: must be an array`);
  } else if (story.acceptanceCriteria.length === 0) {
    errors.push(`${prefix}.acceptanceCriteria: must have at least one criterion`);
  } else {
    for (let i = 0; i < story.acceptanceCriteria.length; i++) {
      const c = story.acceptanceCriteria[i];
      if (typeof c !== 'string') {
        errors.push(`${prefix}.acceptanceCriteria[${i}]: must be a string`);
      } else if (c.length === 0) {
        errors.push(`${prefix}.acceptanceCriteria[${i}]: must not be empty`);
      }
    }
  }

  // priority — positive integer
  if (typeof story.priority !== 'number') {
    errors.push(`${prefix}.priority: must be a number (got ${typeof story.priority})`);
  } else if (!Number.isInteger(story.priority) || story.priority < 1) {
    errors.push(`${prefix}.priority: must be a positive integer (got ${story.priority})`);
  }

  // passes — boolean
  if (typeof story.passes !== 'boolean') {
    errors.push(`${prefix}.passes: must be a boolean (got ${typeof story.passes})`);
  }

  return errors;
}

function validateSchema(json: unknown): { spec: SpecJson | null; errors: string[] } {
  const errors: string[] = [];

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { spec: null, errors: ['Root: must be a JSON object'] };
  }

  const obj = json as Record<string, unknown>;

  // Required top-level string fields
  for (const field of ['project', 'branchName', 'description', 'implementationContext'] as const) {
    const err = requireString(obj, field, field);
    if (err) errors.push(err);
  }

  // userStories — non-empty array
  if (!Array.isArray(obj.userStories)) {
    errors.push('userStories: must be an array');
  } else if (obj.userStories.length === 0) {
    errors.push('userStories: must have at least one user story');
  } else {
    for (let i = 0; i < obj.userStories.length; i++) {
      errors.push(...validateStory(obj.userStories[i], i));
    }
  }

  if (errors.length > 0) return { spec: null, errors };
  return { spec: json as unknown as SpecJson, errors: [] };
}

// --- Semantic checks (beyond structural schema) ---

function semanticChecks(spec: SpecJson): string[] {
  const errors: string[] = [];

  const ids = spec.userStories.map((s) => s.id);
  const priorities = spec.userStories.map((s) => s.priority).sort((a, b) => a - b);

  // Duplicate IDs
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    errors.push(`Duplicate story IDs: ${[...new Set(dupes)].join(', ')}`);
  }

  // Duplicate priorities
  const prioritySet = new Set(priorities);
  if (prioritySet.size !== priorities.length) {
    const dupes = priorities.filter((p, i) => priorities.indexOf(p) !== i);
    errors.push(`Duplicate priorities: ${[...new Set(dupes)].join(', ')}`);
  }

  // Sequential priorities (1, 2, 3, ..., N) — only check if no duplicates
  if (prioritySet.size === priorities.length) {
    for (let i = 0; i < priorities.length; i++) {
      if (priorities[i] !== i + 1) {
        errors.push(
          `Non-sequential priorities: expected ${i + 1} at position ${i}, found ${priorities[i]}. Priorities must be sequential starting from 1.`
        );
        break;
      }
    }
  }

  // Every story should have "Typecheck passes" criterion
  for (const story of spec.userStories) {
    const hasTypecheck = story.acceptanceCriteria.some((c) =>
      c.toLowerCase().includes('typecheck pass')
    );
    if (!hasTypecheck) {
      errors.push(`${story.id}: Missing "Typecheck passes" acceptance criterion`);
    }
  }

  return errors;
}

// --- CLI ---

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: validate-spec.ts <path-to-spec.json>');
  process.exit(1);
}

try {
  const content = readFileSync(filePath, 'utf-8');

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    console.error(`Error: ${filePath} is not valid JSON`);
    process.exit(1);
  }

  const { spec, errors: schemaErrors } = validateSchema(json);

  if (schemaErrors.length > 0) {
    console.error('Schema validation failed:');
    for (const err of schemaErrors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }

  const semanticErrors = semanticChecks(spec!);
  if (semanticErrors.length > 0) {
    console.error('Semantic validation failed:');
    for (const err of semanticErrors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }

  // Status summary on success
  const total = spec!.userStories.length;
  const passing = spec!.userStories.filter((s) => s.passes).length;
  console.log(`spec.json valid. Stories: ${passing}/${total} passing.`);
  process.exit(0);
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`Error reading ${filePath}: ${message}`);
  process.exit(1);
}
