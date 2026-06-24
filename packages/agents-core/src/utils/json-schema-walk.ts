/**
 * Generic, reusable JSON Schema walker.
 *
 * Turns a JSON Schema into a normalized, `$ref`-resolved, cycle-safe tree of nodes
 * that callers can render or introspect without re-implementing ref resolution,
 * nullability unwrapping, or recursion guards. Format-specific emitting (XML, etc.)
 * is left to the caller.
 *
 * Handles the shapes Pydantic-style MCP tool schemas produce: `$ref`/`$defs`,
 * nested objects, array `items`, `anyOf`/`oneOf` nullables (`anyOf [t, null]` and
 * `type: [t, "null"]`), and `enum`/`const`.
 */

export interface NormalizedSchemaNode {
  /** Property name (or `"item"` for an array element). */
  name: string;
  /** Resolved JSON Schema type (non-null branch of a nullable), defaults to `string`. */
  type: string;
  required: boolean;
  nullable: boolean;
  description?: string;
  enumValues?: unknown[];
  /** Present for object nodes. */
  properties?: NormalizedSchemaNode[];
  /** Present for array nodes. */
  items?: NormalizedSchemaNode;
  /** Present for multi-branch unions (`anyOf`/`oneOf` with more than one non-null branch). */
  variants?: NormalizedSchemaNode[];
  /** Set when a `$ref` cycle or the depth cap stopped the walk at this node. */
  recursive?: boolean;
}

export interface WalkJsonSchemaOptions {
  /** Backstop against pathological/cyclic schemas. Defaults to 12. */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 12;

interface WalkCtx {
  defs: Record<string, any>;
  root: any;
  depth: number;
  maxDepth: number;
  seen: Set<string>;
}

function resolveRef(node: any, ctx: WalkCtx): { node: any; refName?: string } {
  if (node && typeof node === 'object' && typeof node.$ref === 'string') {
    const ref: string = node.$ref;
    if (ref === '#') return { node: ctx.root ?? node, refName: '#' };
    const refName = ref.split('/').pop() as string;
    const resolved = ctx.defs[refName];
    return resolved ? { node: resolved, refName } : { node, refName };
  }
  return { node };
}

function unwrapNullable(node: any): { inner: any; nullable: boolean } {
  if (!node || typeof node !== 'object') return { inner: node, nullable: false };
  if (Array.isArray(node.type) && node.type.includes('null')) {
    const nonNull = node.type.filter((t: string) => t !== 'null');
    return {
      inner: { ...node, type: nonNull.length === 1 ? nonNull[0] : nonNull },
      nullable: true,
    };
  }
  const variants = (node.anyOf ?? node.oneOf) as any[] | undefined;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter((v) => v?.type !== 'null');
    const hasNull = variants.some((v) => v?.type === 'null');
    if (hasNull && nonNull.length === 1) return { inner: nonNull[0], nullable: true };
    if (!hasNull && nonNull.length === 1) return { inner: nonNull[0], nullable: false };
    if (hasNull) {
      const key = node.anyOf ? 'anyOf' : 'oneOf';
      return { inner: { ...node, [key]: nonNull }, nullable: true };
    }
  }
  return { inner: node, nullable: false };
}

/**
 * Flatten an `allOf` composition into a single node by merging the (deref'd) branches'
 * properties, required, type, description, and enum. Pydantic v2 emits this shape when it
 * combines a `$ref` with extra constraints (e.g. `{ allOf: [{ $ref }], description }`).
 */
function mergeAllOf(node: any, ctx: WalkCtx): any {
  if (!node || typeof node !== 'object' || !Array.isArray(node.allOf)) return node;

  const merged: any = { ...node };
  merged.allOf = undefined;
  merged.properties = { ...(node.properties ?? {}) };
  const required = new Set<string>(Array.isArray(node.required) ? node.required : []);

  const stack: unknown[] = [...node.allOf];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const { node: branch, refName } = resolveRef(stack.pop(), ctx);
    if (refName) {
      if (visited.has(refName)) continue;
      visited.add(refName);
    }
    if (!branch || typeof branch !== 'object') continue;
    if (Array.isArray(branch.allOf)) stack.push(...branch.allOf);
    if (branch.properties && typeof branch.properties === 'object') {
      Object.assign(merged.properties, branch.properties);
    }
    if (Array.isArray(branch.required)) for (const r of branch.required) required.add(r);
    if (!merged.type && typeof branch.type === 'string') merged.type = branch.type;
    if (!merged.description && typeof branch.description === 'string') {
      merged.description = branch.description;
    }
    if (!merged.enum && Array.isArray(branch.enum)) merged.enum = branch.enum;
  }

  if (Object.keys(merged.properties).length === 0) merged.properties = undefined;
  if (required.size > 0) merged.required = [...required];
  if (!merged.type && merged.properties) merged.type = 'object';
  return merged;
}

function nodeType(node: any): string {
  if (!node) return 'string';
  if (typeof node.type === 'string') return node.type;
  if (Array.isArray(node.type)) {
    const nonNull = node.type.filter((t: string) => t !== 'null');
    return nonNull[0] || 'string';
  }
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) return 'union';
  if (Array.isArray(node.enum)) return typeof node.enum[0] === 'number' ? 'number' : 'string';
  return 'string';
}

function enumValues(node: any): unknown[] | undefined {
  if (Array.isArray(node?.enum)) return node.enum;
  if (node?.const !== undefined) return [node.const];
  return undefined;
}

function walkNode(
  name: string,
  rawNode: any,
  required: boolean,
  ctx: WalkCtx
): NormalizedSchemaNode {
  const { node: derefed, refName: outerRef } = resolveRef(rawNode, ctx);
  const { inner: unwrapped, nullable } = unwrapNullable(derefed);
  // Re-resolve after unwrapping: a nullable/single-branch `$ref` (e.g. Pydantic
  // `Optional[Model]`) only exposes its `$ref` once the null branch is stripped.
  const { node: reResolved, refName: innerRef } = resolveRef(unwrapped, ctx);
  const inner = mergeAllOf(reResolved, ctx);
  const refName = outerRef ?? innerRef;

  const descRaw = inner?.description ?? rawNode?.description;
  const description = typeof descRaw === 'string' ? descRaw.trim() || undefined : undefined;
  const type = nodeType(inner);
  const base: NormalizedSchemaNode = { name, type, required, nullable, description };

  const cyclic = refName ? ctx.seen.has(refName) : false;
  if (cyclic || ctx.depth >= ctx.maxDepth) {
    return { ...base, recursive: true };
  }

  const childCtx: WalkCtx = refName
    ? { ...ctx, depth: ctx.depth + 1, seen: new Set([...ctx.seen, refName]) }
    : { ...ctx, depth: ctx.depth + 1 };

  if (inner?.properties && typeof inner.properties === 'object') {
    const entries = Object.entries(inner.properties as Record<string, any>);
    if (entries.length > 0) {
      const childRequired: string[] = Array.isArray(inner.required) ? inner.required : [];
      const properties = entries.map(([k, v]) =>
        walkNode(k, v, childRequired.includes(k), childCtx)
      );
      return { ...base, type: 'object', properties };
    }
  }

  if (type === 'array' && inner?.items && typeof inner.items === 'object') {
    return { ...base, type: 'array', items: walkNode('item', inner.items, false, childCtx) };
  }

  const branches = (inner?.anyOf ?? inner?.oneOf) as unknown[] | undefined;
  if (Array.isArray(branches) && branches.length > 1) {
    const variants = branches.map((branch, i) => walkNode(`variant${i}`, branch, false, childCtx));
    return { ...base, type: 'union', variants };
  }

  const ev = enumValues(inner);
  return ev ? { ...base, enumValues: ev } : base;
}

/**
 * Normalize a schema's top-level `properties` into ref-resolved, cycle-safe nodes.
 * `$defs`/`definitions` and `$ref: "#"` are resolved against the passed schema root.
 */
export function normalizeJsonSchemaProperties(
  schema: any,
  options: WalkJsonSchemaOptions = {}
): NormalizedSchemaNode[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = (schema.properties ?? {}) as Record<string, any>;
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const ctx: WalkCtx = {
    defs: (schema.$defs ?? schema.definitions ?? {}) as Record<string, any>,
    root: schema,
    depth: 0,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    seen: new Set<string>(),
  };
  return Object.entries(properties).map(([name, node]) =>
    walkNode(name, node, required.includes(name), ctx)
  );
}

/**
 * Unwrap an AI SDK `jsonSchema()` wrapper (`{ jsonSchema, validate, _type }`) to the
 * underlying JSON Schema. The MCP ingestion fallback wraps a raw schema this way; without
 * unwrapping, downstream readers (provider tool def, prompt renderer, manage UI) see the
 * wrapper's top-level keys instead of the real `properties`/`$defs`. A non-wrapper value
 * (plain JSON Schema, or a Zod schema, which has no `jsonSchema` property) passes through.
 */
export function unwrapJsonSchemaWrapper<T>(value: T): T | Record<string, unknown> {
  if (value && typeof value === 'object') {
    const inner = (value as { jsonSchema?: unknown }).jsonSchema;
    if (inner && typeof inner === 'object') {
      return inner as Record<string, unknown>;
    }
  }
  return value;
}
