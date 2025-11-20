import * as z from "zod";
/**
 * A short code indicating the error code returned.
 */
export declare const UnprocessableEntityCode1$zodSchema: z.ZodEnum<["unprocessable_entity"]>;
export type UnprocessableEntityCode1 = z.infer<typeof UnprocessableEntityCode1$zodSchema>;
/**
 * A short code indicating the error code returned.
 */
export declare const UnprocessableEntityCode2$zodSchema: z.ZodEnum<["unprocessable_entity"]>;
export type UnprocessableEntityCode2 = z.infer<typeof UnprocessableEntityCode2$zodSchema>;
/**
 * Legacy error format for backward compatibility.
 */
export type UnprocessableEntityError = {
    code: UnprocessableEntityCode2;
    message: string;
};
export declare const UnprocessableEntityError$zodSchema: z.ZodType<UnprocessableEntityError, z.ZodTypeDef, unknown>;
export type UnprocessableEntity = {
    title: string;
    status: number;
    detail: string;
    instance?: string | undefined;
    requestId?: string | undefined;
    code: UnprocessableEntityCode1;
    error: UnprocessableEntityError;
};
export declare const UnprocessableEntity$zodSchema: z.ZodType<UnprocessableEntity, z.ZodTypeDef, unknown>;
//# sourceMappingURL=unprocessableentity.d.ts.map