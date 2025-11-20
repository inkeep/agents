import * as z from "zod";
export declare const CredentialReferenceType$zodSchema: z.ZodEnum<["memory", "keychain", "nango"]>;
export type CredentialReferenceType = z.infer<typeof CredentialReferenceType$zodSchema>;
export type Tool = {
    tenantId: string;
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    config?: any | null | undefined;
    credentialReferenceId: string | null;
    headers?: any | null | undefined;
    imageUrl: string | null;
    capabilities?: any | null | undefined;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
};
export declare const Tool$zodSchema: z.ZodType<Tool, z.ZodTypeDef, unknown>;
export type CredentialReferenceExternalAgent = {
    tenantId: string;
    id: string;
    projectId: string;
    name: string;
    description: string;
    baseUrl: string;
    credentialReferenceId?: string | null | undefined;
    createdAt: string;
    updatedAt: string;
};
export declare const CredentialReferenceExternalAgent$zodSchema: z.ZodType<CredentialReferenceExternalAgent, z.ZodTypeDef, unknown>;
export type CredentialReference = {
    id: string;
    name: string;
    type: CredentialReferenceType;
    credentialStoreId: string;
    retrievalParams?: {
        [k: string]: any | null;
    } | null | undefined;
    createdAt: string;
    updatedAt: string;
    tools?: Array<Tool> | undefined;
    externalAgents?: Array<CredentialReferenceExternalAgent> | undefined;
};
export declare const CredentialReference$zodSchema: z.ZodType<CredentialReference, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialreference.d.ts.map