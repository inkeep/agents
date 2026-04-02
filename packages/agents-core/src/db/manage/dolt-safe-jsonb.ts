import type { ColumnBaseConfig, ColumnBuilderBaseConfig } from 'drizzle-orm';
import { PgJsonb, PgJsonbBuilder } from 'drizzle-orm/pg-core';

/**
 * Workaround for Doltgres JSON parser bug.
 *
 * Doltgres has an off-by-one error in its JSON escape-sequence state machine:
 * after parsing `\\` (escaped backslash), the parser doesn't reset to normal
 * mode, so the next character is incorrectly treated as an escape character.
 *
 * The workaround encodes literal backslash characters in string values as a
 * Unicode Private-Use-Area character (U+E000) before JSON.stringify, so the
 * serialised JSON never contains `\\`. On read the placeholder is decoded back.
 *
 * Usage: import { jsonb } from './dolt-safe-jsonb' instead of from 'drizzle-orm/pg-core'.
 * All existing .$type<T>(), .notNull(), .default() chains work unchanged.
 */

const BACKSLASH_PLACEHOLDER = '\uE000';

export function encodeBackslashes(value: unknown): unknown {
  if (typeof value === 'string')
    return value.replaceAll('\0', '').replaceAll('\\', BACKSLASH_PLACEHOLDER);
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

type JsonbColumnConfig = ColumnBaseConfig<'json', 'PgJsonb'>;
type JsonbBuilderConfig = ColumnBuilderBaseConfig<'json', 'PgJsonb'>;

class DoltSafeJsonb extends PgJsonb<JsonbColumnConfig> {
  override mapToDriverValue(value: unknown): string {
    return super.mapToDriverValue(encodeBackslashes(value));
  }

  override mapFromDriverValue(value: unknown): unknown {
    return decodeBackslashes(super.mapFromDriverValue(value));
  }
}

class DoltSafeJsonbBuilder extends PgJsonbBuilder<JsonbBuilderConfig> {
  // build() is an internal Drizzle method not in the type defs
  // @ts-expect-error -- overriding internal method to return our subclass
  override build(table: any): any {
    return new DoltSafeJsonb(table, this.config as any);
  }
}

/**
 * Drop-in replacement for drizzle-orm's `jsonb()`.
 * Encodes backslashes on write and decodes on read to work around the Doltgres bug.
 */
export function jsonb(name: string) {
  return new DoltSafeJsonbBuilder(name as any) as unknown as ReturnType<
    typeof import('drizzle-orm/pg-core').jsonb
  >;
}
