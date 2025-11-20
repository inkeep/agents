import * as z from "zod";
export type CreateCredentialInStoreRequest = {
    key: string;
    value: string;
    metadata?: {
        [k: string]: string;
    } | null | undefined;
};
export declare const CreateCredentialInStoreRequest$zodSchema: z.ZodType<CreateCredentialInStoreRequest, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialinstorerequest.d.ts.map