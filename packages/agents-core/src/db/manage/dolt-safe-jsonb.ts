import { PgJsonb } from 'drizzle-orm/pg-core';

/**
 * Workaround for Doltgres JSON parser bug.
 *
 * Doltgres has an off-by-one error in its JSON escape-sequence state machine:
 * after parsing `\\` (escaped backslash), the parser doesn't reset to normal
 * mode, so the next character is incorrectly treated as an escape character.
 * This causes any JSON string containing a literal backslash followed by most
 * characters (n, t, r, a-z, 0-9, etc.) to be rejected with "Bad escaped
 * character" or "Bad control character" errors.
 *
 * Regular PostgreSQL handles this correctly.  This is Doltgres-only.
 *
 * The workaround encodes literal backslash characters in string values as a
 * Unicode Private-Use-Area character (U+E000) *before* JSON.stringify, so the
 * serialised JSON never contains `\\`.  On read the placeholder is decoded back
 * to a real backslash.
 *
 * Limitation: if user data genuinely contains U+E000 it will be round-tripped
 * as a backslash.  This character is in the PUA range and is essentially never
 * used in real-world text.
 */

const BACKSLASH_PLACEHOLDER = '\uE000';

export function encodeBackslashes(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll('\\', BACKSLASH_PLACEHOLDER);
  if (Array.isArray(value)) return value.map(encodeBackslashes);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeBackslashes(v);
    return out;
  }
  return value;
}

export function decodeBackslashes(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll(BACKSLASH_PLACEHOLDER, '\\');
  if (Array.isArray(value)) return value.map(decodeBackslashes);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeBackslashes(v);
    return out;
  }
  return value;
}

// Patch PgJsonb prototype to encode/decode backslashes for Doltgres compatibility.
// This is a global patch — it affects ALL jsonb columns (both manage and runtime).
// For runtime (regular Postgres) the encoding is harmless: U+E000 is a valid Unicode
// character that round-trips through Postgres JSONB without issues.
const origMapToDriverValue = PgJsonb.prototype.mapToDriverValue;
const origMapFromDriverValue = PgJsonb.prototype.mapFromDriverValue;

PgJsonb.prototype.mapToDriverValue = function (value: unknown): string {
  return origMapToDriverValue.call(this, encodeBackslashes(value));
};

PgJsonb.prototype.mapFromDriverValue = function (value: unknown): unknown {
  return decodeBackslashes(origMapFromDriverValue.call(this, value));
};
