import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type CredentialReferenceListResponse } from './credentialreferencelistresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListCredentialsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListCredentialsRequest$zodSchema: z.ZodType<ListCredentialsRequest, z.ZodTypeDef, unknown>;
export type ListCredentialsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialReferenceListResponse?: CredentialReferenceListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListCredentialsResponse$zodSchema: z.ZodType<ListCredentialsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcredentialsop.d.ts.map