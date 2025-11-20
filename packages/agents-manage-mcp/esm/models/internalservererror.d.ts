import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const InternalServerErrorCode1$zodSchema: z.ZodEnum<["internal_server_error"]>;
export type InternalServerErrorCode1 = z.infer<typeof InternalServerErrorCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const InternalServerErrorCode2$zodSchema: z.ZodEnum<["internal_server_error"]>;
export type InternalServerErrorCode2 = z.infer<typeof InternalServerErrorCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type InternalServerErrorError = {
    code: InternalServerErrorCode2;
    message: string;
};
export declare const InternalServerErrorError$zodSchema: z.ZodType<InternalServerErrorError, z.ZodTypeDef, unknown>;
export type InternalServerError = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: InternalServerErrorCode1;
    error: InternalServerErrorError;
};
export declare const InternalServerError$zodSchema: z.ZodType<InternalServerError, z.ZodTypeDef, unknown>;
//# sourceMappingURL=internalservererror.d.ts.map