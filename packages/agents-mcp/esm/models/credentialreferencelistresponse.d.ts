import * as z from 'zod';
import { type CredentialReference } from './credentialreference.js';
import { type Pagination } from './pagination.js';
export type CredentialReferenceListResponse = {
    data: Array<CredentialReference>;
    pagination: Pagination;
};
export declare const CredentialReferenceListResponse$zodSchema: z.ZodType<CredentialReferenceListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=credentialreferencelistresponse.d.ts.map