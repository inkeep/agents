import * as z from "zod";
export declare const CredentialReferenceUpdateType$zodSchema: z.ZodEnum<["memory", "keychain", "nango"]>;
export type CredentialReferenceUpdateType = z.infer<typeof CredentialReferenceUpdateType$zodSchema>;
export type CredentialReferenceUpdate = {
    id?: string | undefined;
    name?: string | undefined;
    type?: CredentialReferenceUpdateType | undefined;
    credentialStoreId?: string | undefined;
    retrievalParams?: {
        [k: string]: any | null;
    } | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const CredentialReferenceUpdate$zodSchema: z.ZodType<CredentialReferenceUpdate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialreferenceupdate.d.ts.map