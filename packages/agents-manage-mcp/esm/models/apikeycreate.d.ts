import * as z from "zod";
export type ApiKeyCreate = {
    agentId: string;
    name?: string | null | undefined;
    expiresAt?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ApiKeyCreate$zodSchema: z.ZodType<ApiKeyCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=apikeycreate.d.ts.map