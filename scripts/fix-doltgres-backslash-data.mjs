#!/usr/bin/env node
/**
 * fix-doltgres-backslash-data.mjs
 *
 * Migrates existing JSONB data in the Doltgres manage database to use the
 * U+E000 backslash encoding introduced by dolt-safe-jsonb.ts.
 *
 * Background:
 *   Doltgres has a JSON parser bug where backslash escape sequences are
 *   mishandled. The application now encodes backslashes as U+E000 on write
 *   and decodes on read. However, data written before that fix still contains
 *   raw backslashes (or Doltgres-corrupted versions of them). This script
 *   re-encodes all existing JSONB values so they are consistent with the new
 *   read pipeline.
 *
 * Modes:
 *   --scan    Read-only audit. Reports rows with raw backslashes, already-encoded
 *             U+E000 placeholders, or suspicious control characters that suggest
 *             Doltgres corruption. No writes.
 *
 *   (default) Dry run. Shows which rows would be updated (backslash → U+E000
 *             encoding) without writing.
 *
 *   --apply   Write mode. Encodes backslashes as U+E000 and commits on each branch.
 *
 * Usage:
 *   # Scan only — find broken/suspect instances (no writes)
 *   node scripts/fix-doltgres-backslash-data.mjs --scan
 *
 *   # Dry run — shows what would change without writing
 *   node scripts/fix-doltgres-backslash-data.mjs
 *
 *   # Apply changes
 *   node scripts/fix-doltgres-backslash-data.mjs --apply
 *
 *   # Target a specific branch
 *   node scripts/fix-doltgres-backslash-data.mjs --scan --branch tenant1_project1_main
 *
 * Environment:
 *   INKEEP_AGENTS_MANAGE_DATABASE_URL — Doltgres connection string (reads from .env)
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve 'pg' from agents-core (pnpm strict resolution)
const require = createRequire(
  path.resolve(__dirname, '..', 'packages', 'agents-core', 'src', 'index.ts')
);
const pg = require('pg');
const { Pool } = pg;

// Load .env from repo root
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const BACKSLASH_PLACEHOLDER = '\uE000';

// ── Table/column map ─────────────────────────────────────────────────────────
// Every JSONB column in the manage schema, grouped by table.

const TABLES = [
  {
    table: 'projects',
    pkColumns: ['tenant_id', 'id'],
    jsonbColumns: ['models', 'stop_when'],
  },
  {
    table: 'agent',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['models', 'status_updates', 'stop_when'],
  },
  {
    table: 'context_configs',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['headers_schema', 'context_variables'],
  },
  {
    table: 'triggers',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['input_schema', 'output_transform', 'authentication', 'signature_verification'],
  },
  {
    table: 'sub_agents',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['conversation_history_config', 'models', 'stop_when'],
  },
  {
    table: 'skills',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['metadata'],
  },
  {
    table: 'data_components',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['props', 'render'],
  },
  {
    table: 'artifact_components',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['props', 'render'],
  },
  {
    table: 'tools',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['config', 'headers', 'capabilities'],
  },
  {
    table: 'functions',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['input_schema', 'dependencies'],
  },
  {
    table: 'sub_agent_tool_relations',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['selected_tools', 'headers', 'tool_policies'],
  },
  {
    table: 'sub_agent_external_agent_relations',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['headers'],
  },
  {
    table: 'sub_agent_team_agent_relations',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['headers'],
  },
  {
    table: 'sub_agent_function_tool_relations',
    pkColumns: ['tenant_id', 'project_id', 'agent_id', 'id'],
    jsonbColumns: ['tool_policies'],
  },
  {
    table: 'credential_references',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['retrieval_params'],
  },
  {
    table: 'dataset_item',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['input', 'expected_output'],
  },
  {
    table: 'evaluator',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['schema', 'model', 'pass_criteria'],
  },
  {
    table: 'evaluation_suite_config',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['filters'],
  },
  {
    table: 'evaluation_job_config',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['job_filters'],
  },
];

// ── Encoding logic (mirrors dolt-safe-jsonb.ts) ──────────────────────────────

function encodeBackslashes(value) {
  if (typeof value === 'string')
    return value.replaceAll('\0', '').replaceAll('\\', BACKSLASH_PLACEHOLDER);
  if (Array.isArray(value)) return value.map(encodeBackslashes);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeBackslashes(v);
    return out;
  }
  return value;
}

function deepContainsBackslash(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.includes('\\');
  if (Array.isArray(value)) return value.some(deepContainsBackslash);
  if (typeof value === 'object') {
    return Object.values(value).some(deepContainsBackslash);
  }
  return false;
}

// ── Scan helpers ─────────────────────────────────────────────────────────────

function deepContainsPlaceholder(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.includes(BACKSLASH_PLACEHOLDER);
  if (Array.isArray(value)) return value.some(deepContainsPlaceholder);
  if (typeof value === 'object') {
    return Object.values(value).some(deepContainsPlaceholder);
  }
  return false;
}

/**
 * Detect suspicious control characters that suggest Doltgres corruption.
 * When Doltgres misparses \\n, it stores a literal newline instead of
 * backslash-n. Similarly \\t → tab, \\r → carriage return.
 * We flag strings that contain these in contexts where they're unusual
 * (e.g., inside serverInstructions or tool prompts).
 */
function collectSuspiciousStrings(value, path = '') {
  const findings = [];
  if (value === null || value === undefined) return findings;
  if (typeof value === 'string') {
    // Flag embedded control chars that likely came from Doltgres corruption
    if (/[\t\r]/.test(value) || (/\n/.test(value) && !value.includes('\n\n'))) {
      // Heuristic: single embedded newlines in non-multiline fields are suspect
      // (multi-paragraph text with \n\n is likely intentional)
      const controlChars = [];
      if (value.includes('\t')) controlChars.push('\\t (tab)');
      if (value.includes('\r')) controlChars.push('\\r (CR)');
      // Only flag newlines if there are no double-newlines (paragraph breaks)
      if (value.includes('\n') && !value.includes('\n\n')) {
        controlChars.push('\\n (newline, possible corruption)');
      }
      if (controlChars.length > 0) {
        findings.push({ path, chars: controlChars, snippet: value.slice(0, 120) });
      }
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      findings.push(...collectSuspiciousStrings(v, `${path}[${i}]`));
    });
    return findings;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      findings.push(...collectSuspiciousStrings(v, path ? `${path}.${k}` : k));
    }
  }
  return findings;
}

// ── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SCAN_MODE = args.includes('--scan');
const APPLY_MODE = args.includes('--apply');
const DRY_RUN = !APPLY_MODE && !SCAN_MODE;
const targetBranch = args.includes('--branch') ? args[args.indexOf('--branch') + 1] : null;

if (SCAN_MODE && APPLY_MODE) {
  console.error('ERROR: --scan and --apply are mutually exclusive.');
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: INKEEP_AGENTS_MANAGE_DATABASE_URL is not set.');
    console.error('Set it in your .env file or as an environment variable.');
    process.exit(1);
  }

  const modeLabel = SCAN_MODE
    ? 'SCAN (read-only audit)'
    : APPLY_MODE
      ? 'APPLY (writing changes)'
      : 'DRY RUN (use --apply to write)';

  console.log(`\n=== Doltgres Backslash Data Migration ===`);
  console.log(`Mode: ${modeLabel}`);
  if (targetBranch) console.log(`Target branch: ${targetBranch}`);
  console.log(`Database: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
  });

  pool.on('error', () => {});

  try {
    // List all branches
    const branchClient = await pool.connect();
    let branches;
    try {
      const branchResult = await branchClient.query('SELECT name FROM dolt_branches');
      branches = branchResult.rows.map((r) => r.name);
    } finally {
      branchClient.release();
    }

    if (targetBranch) {
      if (!branches.includes(targetBranch)) {
        console.error(`Branch '${targetBranch}' not found. Available branches:`);
        for (const b of branches) console.error(`  - ${b}`);
        process.exit(1);
      }
      branches = [targetBranch];
    }

    console.log(`Found ${branches.length} branch(es) to process.\n`);

    const totals = { needsEncoding: 0, alreadyEncoded: 0, suspicious: 0, updates: 0, errors: 0 };

    for (const branch of branches) {
      const result = SCAN_MODE ? await scanBranch(pool, branch) : await processBranch(pool, branch);
      totals.needsEncoding += result.needsEncoding ?? 0;
      totals.alreadyEncoded += result.alreadyEncoded ?? 0;
      totals.suspicious += result.suspicious ?? 0;
      totals.updates += result.updates ?? 0;
      totals.errors += result.errors ?? 0;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Branches processed: ${branches.length}`);
    if (SCAN_MODE) {
      console.log(`Rows with raw backslashes (need encoding): ${totals.needsEncoding}`);
      console.log(`Rows with U+E000 placeholder (already encoded): ${totals.alreadyEncoded}`);
      console.log(`Rows with suspicious control chars (possible corruption): ${totals.suspicious}`);
    } else {
      console.log(`Total rows updated: ${totals.updates}`);
      console.log(`Total errors: ${totals.errors}`);
      if (DRY_RUN && totals.updates > 0) {
        console.log(`\nRe-run with --apply to write these changes.`);
      }
    }
  } finally {
    await pool.end();
  }
}

// ── Scan mode ────────────────────────────────────────────────────────────────

async function scanBranch(pool, branch) {
  const client = await pool.connect();
  const counts = { needsEncoding: 0, alreadyEncoded: 0, suspicious: 0, errors: 0 };

  try {
    await client.query(`SELECT DOLT_CHECKOUT('${escapeSql(branch)}')`);
    console.log(`── Branch: ${branch}`);

    for (const spec of TABLES) {
      try {
        const result = await scanTable(client, spec, branch);
        counts.needsEncoding += result.needsEncoding;
        counts.alreadyEncoded += result.alreadyEncoded;
        counts.suspicious += result.suspicious;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('does not exist') || msg.includes('relation')) continue;
        counts.errors++;
        console.error(`   ERROR scanning ${spec.table}: ${msg}`);
      }
    }
  } finally {
    try {
      await client.query(`SELECT DOLT_CHECKOUT('main')`);
    } catch {}
    client.release();
  }

  return counts;
}

async function scanTable(client, spec, branch) {
  const counts = { needsEncoding: 0, alreadyEncoded: 0, suspicious: 0 };

  const selectCols = [...spec.pkColumns, ...spec.jsonbColumns].join(', ');
  const result = await client.query(`SELECT ${selectCols} FROM "${spec.table}"`);

  for (const row of result.rows) {
    const pkDesc = spec.pkColumns.map((pk) => `${pk}=${row[pk]}`).join(', ');

    for (const col of spec.jsonbColumns) {
      const value = row[col];
      if (value === null || value === undefined) continue;

      const loc = `${spec.table}.${col} WHERE ${pkDesc}`;

      // Check 1: raw backslashes that need encoding
      if (deepContainsBackslash(value)) {
        counts.needsEncoding++;
        console.log(`   [NEEDS ENCODING] ${loc}`);
      }

      // Check 2: already has U+E000 placeholder (written after the fix)
      if (deepContainsPlaceholder(value)) {
        counts.alreadyEncoded++;
        console.log(`   [ALREADY ENCODED] ${loc}`);
      }

      // Check 3: suspicious control characters suggesting Doltgres corruption
      const suspicious = collectSuspiciousStrings(value);
      if (suspicious.length > 0) {
        counts.suspicious++;
        for (const finding of suspicious) {
          console.log(
            `   [SUSPICIOUS] ${loc} at ${finding.path || 'root'}: ${finding.chars.join(', ')}`
          );
          console.log(`               snippet: ${JSON.stringify(finding.snippet)}`);
        }
      }
    }
  }

  return counts;
}

// ── Fix mode (dry-run or apply) ──────────────────────────────────────────────

async function processBranch(pool, branch) {
  const client = await pool.connect();
  let updates = 0;
  let errors = 0;

  try {
    await client.query(`SELECT DOLT_CHECKOUT('${escapeSql(branch)}')`);
    console.log(`── Branch: ${branch}`);

    for (const spec of TABLES) {
      try {
        const count = await processTable(client, spec);
        updates += count;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('does not exist') || msg.includes('relation')) continue;
        errors++;
        console.error(`   ERROR processing ${spec.table} on branch ${branch}: ${msg}`);
      }
    }

    if (APPLY_MODE && updates > 0) {
      try {
        await client.query(`SELECT DOLT_ADD('-A')`);
        await client.query(
          `SELECT DOLT_COMMIT('-m', 'fix: encode backslashes in JSONB data for Doltgres compatibility', '--author', 'migration-script <migration@inkeep.com>')`
        );
        console.log(`   Committed ${updates} row update(s) on branch ${branch}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('nothing to commit')) {
          console.log(`   No actual changes to commit on branch ${branch}`);
        } else {
          throw err;
        }
      }
    } else if (updates > 0) {
      console.log(`   Would update ${updates} row(s) on branch ${branch}`);
    }
  } finally {
    try {
      await client.query(`SELECT DOLT_CHECKOUT('main')`);
    } catch {}
    client.release();
  }

  return { updates, errors };
}

async function processTable(client, spec) {
  let updates = 0;

  const selectCols = [...spec.pkColumns, ...spec.jsonbColumns].join(', ');
  const result = await client.query(`SELECT ${selectCols} FROM "${spec.table}"`);

  for (const row of result.rows) {
    const columnsToUpdate = [];

    for (const col of spec.jsonbColumns) {
      const value = row[col];
      if (value === null || value === undefined) continue;
      if (!deepContainsBackslash(value)) continue;

      const encoded = encodeBackslashes(value);
      const encodedJson = JSON.stringify(encoded);
      columnsToUpdate.push({ column: col, newValue: encodedJson });
    }

    if (columnsToUpdate.length === 0) continue;
    updates++;

    const pkDesc = spec.pkColumns.map((pk) => `${pk}=${row[pk]}`).join(', ');

    if (DRY_RUN) {
      for (const { column } of columnsToUpdate) {
        console.log(`   [dry-run] ${spec.table}.${column} WHERE ${pkDesc}`);
      }
      continue;
    }

    // Build parameterized UPDATE statement
    const setClauses = columnsToUpdate
      .map(({ column }, i) => `"${column}" = $${spec.pkColumns.length + i + 1}::jsonb`)
      .join(', ');

    const whereClauses = spec.pkColumns.map((pk, i) => `"${pk}" = $${i + 1}`).join(' AND ');

    const params = [
      ...spec.pkColumns.map((pk) => row[pk]),
      ...columnsToUpdate.map(({ newValue }) => newValue),
    ];

    await client.query(`UPDATE "${spec.table}" SET ${setClauses} WHERE ${whereClauses}`, params);
  }

  return updates;
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
