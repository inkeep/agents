import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type CredentialStoreListResponse } from './credentialstorelistresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListCredentialStoresRequest = {
    tenantId: string;
    projectId: string;
};
export declare const ListCredentialStoresRequest$zodSchema: z.ZodType<ListCredentialStoresRequest, z.ZodTypeDef, unknown>;
export type ListCredentialStoresResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialStoreListResponse?: CredentialStoreListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListCredentialStoresResponse$zodSchema: z.ZodType<ListCredentialStoresResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcredentialstoresop.d.ts.map