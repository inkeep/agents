/**
 * Helper to extract SQL string from Drizzle sql calls
 * Reconstructs the full SQL by joining all query chunks and parameter values
 */
export function getSqlString(mockExecute: any, callIndex = 0): string {
  const call = mockExecute.mock.calls[callIndex][0];
  if (!call || !call.queryChunks) {
    return '';
  }

  let sql = '';
  for (const chunk of call.queryChunks) {
    if (typeof chunk === 'string') {
      // Direct string value
      sql += chunk;
    } else if (chunk && typeof chunk === 'object' && chunk.value) {
      if (Array.isArray(chunk.value)) {
        // StringChunk - has a value array
        sql += chunk.value.join('');
      } else {
        // Param chunk - has a value property
        sql += String(chunk.value);
      }
    } else if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      // Param chunk with explicit value property check
      sql += String(chunk.value);
    }
  }

  return sql;
}
