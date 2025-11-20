import * as z from "zod";
export declare const CredentialStoreType$zodSchema: z.ZodEnum<["memory", "keychain", "nango"]>;
export type CredentialStoreType = z.infer<typeof CredentialStoreType$zodSchema>;
export type CredentialStore = {
    id: string;
    type: CredentialStoreType;
    available: boolean;
    reason: string | null;
};
export declare const CredentialStore$zodSchema: z.ZodType<CredentialStore, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialstore.d.ts.map