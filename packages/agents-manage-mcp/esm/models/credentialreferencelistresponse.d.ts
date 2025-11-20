import * as z from "zod";
import { CredentialReference } from "./credentialreference.js";
import { Pagination } from "./pagination.js";
export type CredentialReferenceListResponse = {
    data: Array<CredentialReference>;
    pagination: Pagination;
};
export declare const CredentialReferenceListResponse$zodSchema: z.ZodType<CredentialReferenceListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialreferencelistresponse.d.ts.map