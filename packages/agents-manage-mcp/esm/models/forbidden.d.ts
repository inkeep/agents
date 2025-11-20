import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const ForbiddenCode1$zodSchema: z.ZodEnum<["forbidden"]>;
export type ForbiddenCode1 = z.infer<typeof ForbiddenCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const ForbiddenCode2$zodSchema: z.ZodEnum<["forbidden"]>;
export type ForbiddenCode2 = z.infer<typeof ForbiddenCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type ForbiddenError = {
    code: ForbiddenCode2;
    message: string;
};
export declare const ForbiddenError$zodSchema: z.ZodType<ForbiddenError, z.ZodTypeDef, unknown>;
export type Forbidden = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: ForbiddenCode1;
    error: ForbiddenError;
};
export declare const Forbidden$zodSchema: z.ZodType<Forbidden, z.ZodTypeDef, unknown>;
//# sourceMappingURL=forbidden.d.ts.map