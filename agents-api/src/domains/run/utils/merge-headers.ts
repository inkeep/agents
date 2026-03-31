export function mergeHeadersWithoutOverrides(
  existingHeaders: Record<string, string> | undefined,
  forwardedHeaders: Record<string, string>
): Record<string, string> {
  const mergedHeaders = { ...(existingHeaders || {}) };
  const existingHeaderNames = new Set(
    Object.keys(mergedHeaders).map((header) => header.toLowerCase())
  );

  for (const [headerName, headerValue] of Object.entries(forwardedHeaders)) {
    if (existingHeaderNames.has(headerName.toLowerCase())) {
      continue;
    }
    mergedHeaders[headerName] = headerValue;
  }

  return mergedHeaders;
}
