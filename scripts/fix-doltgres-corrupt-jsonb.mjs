#!/usr/bin/env node
/**
 * fix-doltgres-corrupt-jsonb.mjs
 *
 * Repairs JSONB rows that Doltgres corrupted with its broken escape-sequence
 * parser. These rows contain invalid JSON that throws "Bad escaped character"
 * when read by the pg driver.
 *
 * Two repair strategies:
 *   - tools.capabilities → NULL (auto-rediscovered on next MCP health check)
 *   - data_components.props/render → attempt JSON repair (user-authored data)
 *
 * How it works:
 *   1. Overrides the pg JSONB type parser to return raw strings (no JSON.parse)
 *   2. For each branch, reads all rows from affected tables
 *   3. Tries JSON.parse on each JSONB column to find broken ones
 *   4. Applies the repair strategy per table
 *   5. Commits on the branch
 *
 * Usage:
 *   # Scan — find corrupt rows (no writes)
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs --scan
 *
 *   # Dry run (default) — show what would be fixed
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs
 *
 *   # Dump — write full raw content of each corrupt column to a file for review
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs --dump
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs --dump --out /tmp/corrupt.txt
 *
 *   # Apply fixes
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs --apply
 *
 *   # Target a specific branch
 *   node scripts/fix-doltgres-corrupt-jsonb.mjs --scan --branch default_bryan_main
 *
 * Environment:
 *   INKEEP_AGENTS_MANAGE_DATABASE_URL — Doltgres connection string
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(
  path.resolve(__dirname, '..', 'packages', 'agents-core', 'src', 'index.ts')
);
const pg = require('pg');
const { Pool, types } = pg;

// Override JSONB type parser to return raw strings — prevents JSON.parse errors
// OID 114 = json, 3802 = jsonb
types.setTypeParser(114, (val) => val);
types.setTypeParser(3802, (val) => val);

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

// ── Tables with known corruption ─────────────────────────────────────────────

const TABLES = [
  {
    table: 'tools',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['config', 'headers', 'capabilities'],
    // capabilities is auto-discovered from MCP, safe to null
    nullableColumns: ['capabilities'],
  },
  {
    table: 'data_components',
    pkColumns: ['tenant_id', 'project_id', 'id'],
    jsonbColumns: ['props', 'render'],
    // user-authored data — must attempt repair
    nullableColumns: [],
  },
];

// ── JSON repair ──────────────────────────────────────────────────────────────

/**
 * Try to parse JSON. Returns { ok: true, value } or { ok: false, error }.
 */
function tryParse(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (err) {
    return { ok: false, error: err.message, raw: str };
  }
}

/**
 * Attempt to repair invalid JSON from Doltgres corruption.
 *
 * Known corruption patterns:
 *   1. \X where X is not a valid JSON escape char → escape the backslash: \\X
 *   2. Literal control chars (newline, tab) inside strings → escape them
 */
function repairJson(raw) {
  let repaired = raw;

  // Fix 1: Replace invalid \X escape sequences with \\X
  // Valid JSON escapes after \: " \ / b f n r t u
  // We need to be careful not to double-escape already valid sequences
  repaired = repaired.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

  // Fix 2: Replace literal control characters inside JSON strings
  // (These should be escaped but Doltgres inserted them raw)
  // We need to only replace control chars INSIDE string values, not structural chars
  repaired = repairControlCharsInStrings(repaired);

  const result = tryParse(repaired);
  if (result.ok) {
    return { ok: true, repaired, value: result.value };
  }

  // Second attempt: more aggressive repair
  // Sometimes the backslash is followed by a newline (Doltgres turned \\n into \<LF>)
  let aggressive = raw;
  // Replace backslash followed by literal newline → \\n
  aggressive = aggressive.replace(/\\\n/g, '\\\\n');
  // Replace backslash followed by literal tab → \\t
  aggressive = aggressive.replace(/\\\t/g, '\\\\t');
  // Replace backslash followed by literal CR → \\r
  aggressive = aggressive.replace(/\\\r/g, '\\\\r');
  // Then fix remaining invalid escapes
  aggressive = aggressive.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  aggressive = repairControlCharsInStrings(aggressive);

  const aggressiveResult = tryParse(aggressive);
  if (aggressiveResult.ok) {
    return { ok: true, repaired: aggressive, value: aggressiveResult.value };
  }

  return {
    ok: false,
    error: aggressiveResult.error,
    raw,
  };
}

/**
 * Replace literal control characters (0x00-0x1F) that appear inside JSON
 * string values with their escaped equivalents.
 */
function repairControlCharsInStrings(json) {
  // This regex-based approach works on the raw JSON string:
  // Find characters 0x00-0x1F that are NOT preceded by a backslash
  // (i.e., they're raw control chars, not already-escaped sequences)
  return json.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (ch) => {
    return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Encode backslashes as U+E000 for Doltgres-safe storage.
 * Mirrors dolt-safe-jsonb.ts encodeBackslashes.
 */
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

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DUMP_MODE = args.includes('--dump');
const SCAN_MODE = args.includes('--scan') || (DUMP_MODE && !args.includes('--apply'));
const APPLY_MODE = args.includes('--apply');
const DRY_RUN = !APPLY_MODE && !SCAN_MODE;
const targetBranch = args.includes('--branch') ? args[args.indexOf('--branch') + 1] : null;
const dumpFile = DUMP_MODE
  ? args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : path.resolve(__dirname, '..', 'corrupt-jsonb-dump.txt')
  : null;

if (APPLY_MODE && DUMP_MODE) {
  console.error('ERROR: --apply and --dump cannot be combined.');
  process.exit(1);
}

// Dump state (module-level so processTable can append)
const dumpSeen = new Set();
const dumpChunks = [];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: INKEEP_AGENTS_MANAGE_DATABASE_URL is not set.');
    process.exit(1);
  }

  const modeLabel = SCAN_MODE
    ? 'SCAN (read-only)'
    : APPLY_MODE
      ? 'APPLY (writing fixes)'
      : 'DRY RUN (use --apply to write)';

  console.log(`\n=== Doltgres Corrupt JSONB Repair ===`);
  console.log(`Mode: ${modeLabel}`);
  if (DUMP_MODE) console.log(`Dump: writing full content to ${dumpFile}`);
  if (targetBranch) console.log(`Target branch: ${targetBranch}`);
  console.log(`Database: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
  });

  // Prevent unhandled pool errors from crashing the process during cleanup
  pool.on('error', () => {});

  try {
    const branchClient = await pool.connect();
    let branches;
    try {
      const res = await branchClient.query('SELECT name FROM dolt_branches');
      branches = res.rows.map((r) => r.name);
    } finally {
      branchClient.release();
    }

    if (targetBranch) {
      if (!branches.includes(targetBranch)) {
        console.error(`Branch '${targetBranch}' not found.`);
        process.exit(1);
      }
      branches = [targetBranch];
    }

    console.log(`Found ${branches.length} branch(es) to process.\n`);

    if (DUMP_MODE) {
      dumpChunks.push(`Doltgres Corrupt JSONB Dump\nGenerated: ${new Date().toISOString()}\n`);
      dumpChunks.push(`${'='.repeat(80)}\n`);
    }

    const totals = { corrupt: 0, repaired: 0, nulled: 0, unrecoverable: 0, errors: 0 };

    for (const branch of branches) {
      const result = await processBranch(pool, branch);
      totals.corrupt += result.corrupt;
      totals.repaired += result.repaired;
      totals.nulled += result.nulled;
      totals.unrecoverable += result.unrecoverable;
      totals.errors += result.errors;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Branches processed: ${branches.length}`);
    console.log(`Corrupt JSONB columns found: ${totals.corrupt}`);
    if (!SCAN_MODE) {
      console.log(`Repaired (JSON fixed + U+E000 encoded): ${totals.repaired}`);
      console.log(`Nulled (auto-recoverable, e.g. tools.capabilities): ${totals.nulled}`);
    }
    console.log(`Unrecoverable (repair failed): ${totals.unrecoverable}`);
    console.log(`Errors: ${totals.errors}`);
    if (DRY_RUN && totals.repaired + totals.nulled > 0) {
      console.log(`\nRe-run with --apply to write these fixes.`);
    }
    if (DUMP_MODE) {
      fs.writeFileSync(dumpFile, dumpChunks.join(''));
      console.log(`\nWrote ${dumpSeen.size} unique corrupt column(s) to ${dumpFile}`);
    }
  } finally {
    await pool.end();
  }
}

async function processBranch(pool, branch) {
  const client = await pool.connect();
  const counts = { corrupt: 0, repaired: 0, nulled: 0, unrecoverable: 0, errors: 0 };

  try {
    await client.query(`SELECT DOLT_CHECKOUT('${escapeSql(branch)}')`);

    let branchHasFindings = false;

    for (const spec of TABLES) {
      try {
        const result = await processTable(client, spec, branch);
        if (result.corrupt > 0 && !branchHasFindings) {
          console.log(`── Branch: ${branch}`);
          branchHasFindings = true;
        }
        counts.corrupt += result.corrupt;
        counts.repaired += result.repaired;
        counts.nulled += result.nulled;
        counts.unrecoverable += result.unrecoverable;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('does not exist') || msg.includes('relation')) continue;
        counts.errors++;
        if (!branchHasFindings) {
          console.log(`── Branch: ${branch}`);
          branchHasFindings = true;
        }
        console.error(`   ERROR ${spec.table}: ${msg}`);
      }
    }

    // Commit changes
    if (APPLY_MODE && counts.repaired + counts.nulled > 0) {
      try {
        await client.query(`SELECT DOLT_ADD('-A')`);
        await client.query(
          `SELECT DOLT_COMMIT('-m', 'fix: repair corrupt JSONB from Doltgres backslash bug', '--author', 'migration-script <migration@inkeep.com>')`
        );
        console.log(
          `   Committed: ${counts.repaired} repaired, ${counts.nulled} nulled on ${branch}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('nothing to commit')) throw err;
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

async function processTable(client, spec, branch) {
  const counts = { corrupt: 0, repaired: 0, nulled: 0, unrecoverable: 0 };

  const selectCols = [...spec.pkColumns, ...spec.jsonbColumns].join(', ');
  const result = await client.query(`SELECT ${selectCols} FROM "${spec.table}"`);

  for (const row of result.rows) {
    for (const col of spec.jsonbColumns) {
      const raw = row[col];
      if (raw === null || raw === undefined) continue;

      const parsed = tryParse(raw);
      if (parsed.ok) continue; // Not corrupt

      counts.corrupt++;
      const pkDesc = spec.pkColumns.map((pk) => `${pk}=${row[pk]}`).join(', ');
      const loc = `${spec.table}.${col} WHERE ${pkDesc}`;

      // Collect dump data when --dump is active (works with --scan or alone)
      if (DUMP_MODE) {
        const dedupeKey = `${spec.table}.${col}|${pkDesc}`;
        if (!dumpSeen.has(dedupeKey)) {
          dumpSeen.add(dedupeKey);
          const rawStr = typeof raw === 'string' ? raw : String(raw);
          dumpChunks.push(`\n${'─'.repeat(80)}\n`);
          dumpChunks.push(`Table:    ${spec.table}\n`);
          dumpChunks.push(`Column:   ${col}\n`);
          dumpChunks.push(`PK:       ${pkDesc}\n`);
          dumpChunks.push(`Branch:   ${branch} (first occurrence)\n`);
          dumpChunks.push(`Error:    ${parsed.error}\n`);
          dumpChunks.push(`Length:   ${rawStr.length} chars\n`);
          dumpChunks.push(`\n--- RAW CONTENT (with control chars shown as escapes) ---\n\n`);
          const visible = rawStr
            .replace(/\n/g, '\\n\n')
            .replace(/\t/g, '\\t')
            .replace(/\r/g, '\\r');
          dumpChunks.push(visible);
          dumpChunks.push(`\n\n--- END RAW CONTENT ---\n`);
        }
      }

      if (SCAN_MODE) {
        console.log(`   [CORRUPT] ${loc}`);
        console.log(`      Error: ${parsed.error}`);
        const snippet = typeof raw === 'string' ? raw : JSON.stringify(raw);
        // Show the area around the error position
        const match = parsed.error.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1]);
          const start = Math.max(0, pos - 40);
          const end = Math.min(snippet.length, pos + 40);
          const before = snippet.slice(start, pos);
          const after = snippet.slice(pos, end);
          console.log(
            `      Context: ...${JSON.stringify(before)}>>HERE>>${JSON.stringify(after)}...`
          );
        }
        continue;
      }

      // Determine repair strategy
      const canNull = spec.nullableColumns.includes(col);

      if (canNull) {
        // Strategy: null out (will be auto-rediscovered)
        counts.nulled++;
        if (DRY_RUN) {
          console.log(`   [WILL NULL] ${loc} (auto-recoverable)`);
          const rawStr = typeof raw === 'string' ? raw : String(raw);
          console.log(simpleDiff(rawStr, 'NULL'));
          continue;
        }
        const whereClauses = spec.pkColumns.map((pk, i) => `"${pk}" = $${i + 1}`).join(' AND ');
        const params = spec.pkColumns.map((pk) => row[pk]);
        await client.query(
          `UPDATE "${spec.table}" SET "${col}" = NULL WHERE ${whereClauses}`,
          params
        );
        console.log(`   [NULLED] ${loc}`);
      } else {
        // Strategy: attempt JSON repair
        const repair = repairJson(typeof raw === 'string' ? raw : String(raw));
        if (repair.ok) {
          counts.repaired++;
          // Encode backslashes as U+E000 for Doltgres-safe storage
          const encoded = encodeBackslashes(repair.value);
          const encodedJson = JSON.stringify(encoded);

          if (DRY_RUN) {
            console.log(`   [WILL REPAIR] ${loc}`);
            const rawStr = typeof raw === 'string' ? raw : String(raw);
            // Pretty-print both sides with matching structure so the diff
            // only highlights actual content changes, not formatting noise
            const prettyBefore = naivePrettyJson(rawStr);
            const prettyAfter = naivePrettyJson(encodedJson);
            console.log(simpleDiff(prettyBefore, prettyAfter));
            continue;
          }
          const whereClauses = spec.pkColumns.map((pk, i) => `"${pk}" = $${i + 1}`).join(' AND ');
          const params = [...spec.pkColumns.map((pk) => row[pk]), encodedJson];
          await client.query(
            `UPDATE "${spec.table}" SET "${col}" = $${spec.pkColumns.length + 1}::jsonb WHERE ${whereClauses}`,
            params
          );
          console.log(`   [REPAIRED] ${loc}`);
        } else {
          counts.unrecoverable++;
          console.log(`   [UNRECOVERABLE] ${loc}`);
          console.log(`      Original error: ${parsed.error}`);
          console.log(`      Repair error: ${repair.error}`);
        }
      }
    }
  }

  return counts;
}

/**
 * Naive JSON pretty-printer that works on raw (possibly invalid) JSON strings.
 * Inserts newlines after structural characters so line-based diffs are useful.
 * Does NOT parse the JSON — works purely on the string level.
 */
function naivePrettyJson(raw) {
  const out = [];
  let indent = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      out.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      out.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out.push(ch);
      continue;
    }

    if (inString) {
      out.push(ch);
      continue;
    }

    if (ch === '{' || ch === '[') {
      out.push(ch);
      indent += 2;
      out.push('\n' + ' '.repeat(indent));
    } else if (ch === '}' || ch === ']') {
      indent = Math.max(0, indent - 2);
      out.push('\n' + ' '.repeat(indent));
      out.push(ch);
    } else if (ch === ',') {
      out.push(ch);
      out.push('\n' + ' '.repeat(indent));
    } else if (ch === ':') {
      out.push(': ');
    } else if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
      out.push(ch);
    }
  }

  return out.join('');
}

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BADGE_DEL = '\x1b[41m\x1b[97m'; // white on red bg
const BADGE_ADD = '\x1b[42m\x1b[30m'; // black on green bg
const HL_DEL = '\x1b[41m\x1b[97m'; // highlight deleted chars
const HL_ADD = '\x1b[42m\x1b[30m'; // highlight inserted chars

/**
 * Character-level diff: find the exact changed region within a line pair.
 * Trims common prefix/suffix, highlights only the differing middle.
 */
function charDiff(a, b) {
  const maxLen = 2000;
  const aStr = a.length > maxLen ? a.slice(0, maxLen) : a;
  const bStr = b.length > maxLen ? b.slice(0, maxLen) : b;

  let pre = 0;
  while (pre < aStr.length && pre < bStr.length && aStr[pre] === bStr[pre]) pre++;
  let suf = 0;
  while (
    suf < aStr.length - pre &&
    suf < bStr.length - pre &&
    aStr[aStr.length - 1 - suf] === bStr[bStr.length - 1 - suf]
  )
    suf++;

  const prefix = aStr.slice(0, pre);
  const aMid = aStr.slice(pre, aStr.length - suf);
  const bMid = bStr.slice(pre, bStr.length - suf);
  const suffix = aStr.slice(aStr.length - suf);

  return {
    prefix,
    suffix,
    delPart: aMid.length > 0 ? `${HL_DEL}${aMid}${RESET}${RED}` : '',
    addPart: bMid.length > 0 ? `${HL_ADD}${bMid}${RESET}${GREEN}` : '',
  };
}

/**
 * Colorized diff with character-level highlighting.
 * Within changed lines, the exact differing characters get a background color.
 */
function simpleDiff(before, after, contextLines = 3) {
  const visualize = (s) => s.replace(/\t/g, '\\t').replace(/\r/g, '\\r');

  const aLines = visualize(before).split('\n');
  const bLines = visualize(after).split('\n');
  const lines = [];

  const maxLen = Math.max(aLines.length, bLines.length);
  const changed = new Set();
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) changed.add(i);
  }
  if (changed.size === 0) return `      ${DIM}(no visible difference)${RESET}\n`;

  const show = new Set();
  for (const i of changed) {
    for (let c = Math.max(0, i - contextLines); c <= Math.min(maxLen - 1, i + contextLines); c++) {
      show.add(c);
    }
  }

  let lastShown = -2;
  for (let i = 0; i < maxLen; i++) {
    if (!show.has(i)) continue;
    if (i > lastShown + 1) lines.push(`      ${DIM}...${RESET}`);
    lastShown = i;

    if (changed.has(i)) {
      const aLine = i < aLines.length ? aLines[i] : '';
      const bLine = i < bLines.length ? bLines[i] : '';
      const { prefix, delPart, addPart, suffix } = charDiff(aLine, bLine);

      if (i < aLines.length)
        lines.push(`      ${BADGE_DEL} - ${RESET}${RED} ${prefix}${delPart}${suffix}${RESET}`);
      if (i < bLines.length)
        lines.push(`      ${BADGE_ADD} + ${RESET}${GREEN} ${prefix}${addPart}${suffix}${RESET}`);
    } else {
      const line = i < aLines.length ? aLines[i] : bLines[i];
      lines.push(`      ${DIM}   ${line}${RESET}`);
    }
  }
  return lines.join('\n') + '\n';
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
