export type ExactPartial<T> = {
    [P in keyof T]?: T[P] | undefined;
};
export declare function abortSignalAny(signals: AbortSignal[]): AbortSignal;
export declare function allRequired<V extends Record<string, unknown>>(v: V): {
    [K in keyof V]: NonNullable<V[K]>;
} | undefined;
export declare function combineSignals(...signals: Array<AbortSignal | null | undefined>): AbortSignal | null;
export declare function compactMap<T>(values: Record<string, T | undefined>): Record<string, T>;
export declare function invariant(condition: unknown, message: string): asserts condition;
//# sourceMappingURL=primitives.d.ts.map