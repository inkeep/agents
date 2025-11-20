import * as z from "zod";
export declare const CredentialReferenceCreateType$zodSchema: z.ZodEnum<["memory", "keychain", "nango"]>;
export type CredentialReferenceCreateType = z.infer<typeof CredentialReferenceCreateType$zodSchema>;
export type CredentialReferenceCreate = {
    id: string;
    name: string;
    type: CredentialReferenceCreateType;
    credentialStoreId: string;
    retrievalParams?: {
        [k: string]: any | null;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const CredentialReferenceCreate$zodSchema: z.ZodType<CredentialReferenceCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialreferencecreate.d.ts.map