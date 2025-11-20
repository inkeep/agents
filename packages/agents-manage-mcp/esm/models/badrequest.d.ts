import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const BadRequestCode1$zodSchema: z.ZodEnum<["bad_request"]>;
export type BadRequestCode1 = z.infer<typeof BadRequestCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const BadRequestCode2$zodSchema: z.ZodEnum<["bad_request"]>;
export type BadRequestCode2 = z.infer<typeof BadRequestCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type BadRequestError = {
    code: BadRequestCode2;
    message: string;
};
export declare const BadRequestError$zodSchema: z.ZodType<BadRequestError, z.ZodTypeDef, unknown>;
export type BadRequest = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: BadRequestCode1;
    error: BadRequestError;
};
export declare const BadRequest$zodSchema: z.ZodType<BadRequest, z.ZodTypeDef, unknown>;
//# sourceMappingURL=badrequest.d.ts.map