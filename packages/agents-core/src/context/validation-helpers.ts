type Primitive = string | number | boolean | bigint | symbol | null | undefined | Date;

type JoinDot<P extends string, K extends string> = [P] extends [''] ? K : `${P}.${K}`;

export type DotPaths<T, P extends string = ''> = [T] extends [Primitive] // primitives (including null/undefined) — the path ends here
  ? P
  : // arrays — no dot before brackets; allow both [number] and [*]
    T extends ReadonlyArray<infer U>
    ? P | DotPaths<U, `${P}[${number}]`> | DotPaths<U, `${P}[*]`>
    : T extends Array<infer U>
      ? P | DotPaths<U, `${P}[${number}]`> | DotPaths<U, `${P}[*]`>
      : // objects — include the object path AND recurse on keys with dot join
        T extends object
        ?
            | P
            | { [K in Extract<keyof T, string>]: DotPaths<T[K], JoinDot<P, K>> }[Extract<
                keyof T,
                string
              >]
        : P;
