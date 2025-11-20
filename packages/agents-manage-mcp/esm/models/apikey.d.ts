import * as z from "zod";
export type ApiKey = {
    id: string;
    agentId: string;
    publicId: string;
    keyPrefix: string;
    name: string | null;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export declare const ApiKey$zodSchema: z.ZodType<ApiKey, z.ZodTypeDef, unknown>;
//# sourceMappingURL=apikey.d.ts.map