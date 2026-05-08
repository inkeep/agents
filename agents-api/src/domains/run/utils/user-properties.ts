type JsonHeaderLogger = { warn: (obj: Record<string, unknown>, msg: string) => void };

// `x-inkeep-user-properties` and `x-inkeep-properties` are **widget-internal
// transport headers**, not part of the public chat API contract. They exist
// because the @inkeep/agents-ui-cloud widget injects userProperties at the
// transport layer (request headers, not body params), separate from any
// caller-supplied request body. SDK callers should set the corresponding
// `userProperties` / `properties` body fields on /run/v1/chat/* requests
// instead — those fields take precedence over the headers via `body.X ?? …`
// at the call site, and are documented in the route schema.
//
// Distinct from the context-config headers documented in
// `agents-docs/content/typescript-sdk/headers.mdx`, which are user-defined
// values consumed by template fetchers and prompts. These two
// `x-inkeep-*` headers are not part of that surface.
//
// Parses a JSON-encoded header into a plain object, returning undefined when
// the header is missing, malformed, or not a plain object. A `logger` may be
// passed to surface a warn-level trace when a non-empty header fails to
// parse or has the wrong shape — silent drops at this trust boundary make
// "why are userProperties null for this conversation?" effectively
// undebuggable in production.
export function parseInkeepJsonHeader(
  header: string | undefined,
  opts?: { headerName?: string; logger?: JsonHeaderLogger }
): Record<string, unknown> | undefined {
  if (!header) return undefined;
  try {
    const parsed = JSON.parse(header);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    opts?.logger?.warn(
      { headerName: opts?.headerName, valueType: Array.isArray(parsed) ? 'array' : typeof parsed },
      'Inkeep JSON header parsed but is not a plain object; ignoring'
    );
    return undefined;
  } catch (err) {
    opts?.logger?.warn(
      {
        headerName: opts?.headerName,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to parse Inkeep JSON header; ignoring'
    );
    return undefined;
  }
}

// The @inkeep/agents-ui-cloud widget synthesizes a client-side identity
// (`id` + `identificationType`) for every chat request, regardless of whether
// the host set `baseSettings.userProperties`. ANONYMOUS = nanoid in memory,
// COOKIED = nanoid persisted to localStorage. Only ID_PROVIDED reflects a
// host-supplied identity. Drop the other two so synthesized junk doesn't
// land in conversations.userProperties / messages.userProperties / webhook
// payloads. The verified `sub` from JWT auth still flows via endUserId.
export function isAutoMintIdentity(v: Record<string, unknown> | undefined): boolean {
  if (!v) return false;
  const t = v.identificationType;
  return t === 'ANONYMOUS' || t === 'COOKIED';
}

// `identificationType` is widget introspection metadata, not customer data.
// Strip it before persistence so downstream payloads carry only what the
// host actually supplied.
export function stripIdentificationType(
  v: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!v) return v;
  const { identificationType: _drop, ...rest } = v;
  return rest;
}
