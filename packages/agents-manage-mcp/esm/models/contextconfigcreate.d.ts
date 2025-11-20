import * as z from "zod";
/**
 * JSON Schema for validating request headers
 */
export type ContextConfigCreateHeadersSchema = {};
export declare const ContextConfigCreateHeadersSchema$zodSchema: z.ZodType<ContextConfigCreateHeadersSchema, z.ZodTypeDef, unknown>;
/**
 * Context variables configuration with fetch definitions
 */
export type ContextConfigCreateContextVariables = {};
export declare const ContextConfigCreateContextVariables$zodSchema: z.ZodType<ContextConfigCreateContextVariables, z.ZodTypeDef, unknown>;
export type ContextConfigCreate = {
    id?: string | undefined;
    headersSchema?: ContextConfigCreateHeadersSchema | undefined;
    contextVariables?: ContextConfigCreateContextVariables | undefined;
};
export declare const ContextConfigCreate$zodSchema: z.ZodType<ContextConfigCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=contextconfigcreate.d.ts.map