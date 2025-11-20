import * as z from "zod";
export type ExternalAgentCreate = {
    id: string;
    name: string;
    description: string;
    baseUrl: string;
    credentialReferenceId?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ExternalAgentCreate$zodSchema: z.ZodType<ExternalAgentCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=externalagentcreate.d.ts.map