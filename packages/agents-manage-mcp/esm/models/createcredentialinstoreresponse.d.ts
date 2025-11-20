import * as z from "zod";
export type CreateCredentialInStoreResponseData = {
    key: string;
    storeId: string;
    createdAt: string;
};
export declare const CreateCredentialInStoreResponseData$zodSchema: z.ZodType<CreateCredentialInStoreResponseData, z.ZodTypeDef, unknown>;
export type CreateCredentialInStoreResponse = {
    data: CreateCredentialInStoreResponseData;
};
export declare const CreateCredentialInStoreResponse$zodSchema: z.ZodType<CreateCredentialInStoreResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialinstoreresponse.d.ts.map