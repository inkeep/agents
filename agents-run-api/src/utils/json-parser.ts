import destr from 'destr'; // safe JSON.parse-if-JSON
import traverse from 'traverse'; // tiny object walker

/**
 * Turn any string value that is valid JSON into an object/array (in place).
 * Useful for parsing MCP tool results and other string data that may contain embedded JSON.
 */
export function parseEmbeddedJson<T>(data: T): T {
  return traverse(data).map(function (x) {
    if (typeof x === 'string') {
      const v = destr(x); // returns original string if not JSON
      if (v !== x && (Array.isArray(v) || (v && typeof v === 'object'))) {
        this.update(v); // replace the string with the parsed value
      }
    }
  });
}