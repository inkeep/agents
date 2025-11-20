import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const NotFoundCode1$zodSchema: z.ZodEnum<["not_found"]>;
export type NotFoundCode1 = z.infer<typeof NotFoundCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const NotFoundCode2$zodSchema: z.ZodEnum<["not_found"]>;
export type NotFoundCode2 = z.infer<typeof NotFoundCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type NotFoundError = {
    code: NotFoundCode2;
    message: string;
};
export declare const NotFoundError$zodSchema: z.ZodType<NotFoundError, z.ZodTypeDef, unknown>;
export type NotFound = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: NotFoundCode1;
    error: NotFoundError;
};
export declare const NotFound$zodSchema: z.ZodType<NotFound, z.ZodTypeDef, unknown>;
//# sourceMappingURL=notfound.d.ts.map