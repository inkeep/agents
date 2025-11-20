import * as z from "zod";
/**
 * JSON Schema for validating request headers
 */
export type ContextConfigHeadersSchema = {};
export declare const ContextConfigHeadersSchema$zodSchema: z.ZodType<ContextConfigHeadersSchema, z.ZodTypeDef, unknown>;
export type ContextConfig = {
    id: string;
    headersSchema?: ContextConfigHeadersSchema | undefined;
    contextVariables?: any | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const ContextConfig$zodSchema: z.ZodType<ContextConfig, z.ZodTypeDef, unknown>;
//# sourceMappingURL=contextconfig.d.ts.map