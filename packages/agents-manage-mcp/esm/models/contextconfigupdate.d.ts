import * as z from "zod";
/**
 * JSON Schema for validating request headers
 */
export type ContextConfigUpdateHeadersSchema = {};
export declare const ContextConfigUpdateHeadersSchema$zodSchema: z.ZodType<ContextConfigUpdateHeadersSchema, z.ZodTypeDef, unknown>;
/**
 * Context variables configuration with fetch definitions
 */
export type ContextConfigUpdateContextVariables = {};
export declare const ContextConfigUpdateContextVariables$zodSchema: z.ZodType<ContextConfigUpdateContextVariables, z.ZodTypeDef, unknown>;
export type ContextConfigUpdate = {
    id?: string | undefined;
    headersSchema?: ContextConfigUpdateHeadersSchema | undefined;
    contextVariables?: ContextConfigUpdateContextVariables | undefined;
};
export declare const ContextConfigUpdate$zodSchema: z.ZodType<ContextConfigUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=contextconfigupdate.d.ts.map