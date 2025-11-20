import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const UnauthorizedCode1$zodSchema: z.ZodEnum<["unauthorized"]>;
export type UnauthorizedCode1 = z.infer<typeof UnauthorizedCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const UnauthorizedCode2$zodSchema: z.ZodEnum<["unauthorized"]>;
export type UnauthorizedCode2 = z.infer<typeof UnauthorizedCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type UnauthorizedError = {
    code: UnauthorizedCode2;
    message: string;
};
export declare const UnauthorizedError$zodSchema: z.ZodType<UnauthorizedError, z.ZodTypeDef, unknown>;
export type Unauthorized = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: UnauthorizedCode1;
    error: UnauthorizedError;
};
export declare const Unauthorized$zodSchema: z.ZodType<Unauthorized, z.ZodTypeDef, unknown>;
//# sourceMappingURL=unauthorized.d.ts.map