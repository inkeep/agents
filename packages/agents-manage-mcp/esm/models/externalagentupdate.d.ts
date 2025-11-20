import * as z from "zod";
export type ExternalAgentUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    baseUrl?: string | undefined;
    credentialReferenceId?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const ExternalAgentUpdate$zodSchema: z.ZodType<ExternalAgentUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=externalagentupdate.d.ts.map