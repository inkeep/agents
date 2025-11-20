import * as z from "zod";
export type ApiKeyUpdate = {
    agentId?: string | undefined;
    name?: string | null | undefined;
    lastUsedAt?: string | null | undefined;
    expiresAt?: string | null | undefined;
    updatedAt?: string | undefined;
};
export declare const ApiKeyUpdate$zodSchema: z.ZodType<ApiKeyUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=apikeyupdate.d.ts.map