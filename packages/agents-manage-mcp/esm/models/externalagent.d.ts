import * as z from "zod";
export type ExternalAgent = {
    id: string;
    name: string;
    description: string;
    baseUrl: string;
    credentialReferenceId?: string | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const ExternalAgent$zodSchema: z.ZodType<ExternalAgent, z.ZodTypeDef, unknown>;
//# sourceMappingURL=externalagent.d.ts.map