import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type CredentialReferenceCreate } from './credentialreferencecreate.js';
import { type CredentialReferenceResponse } from './credentialreferenceresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateCredentialRequest = {
    tenantId: string;
    projectId: string;
    body?: CredentialReferenceCreate | undefined;
};
export declare const CreateCredentialRequest$zodSchema: z.ZodType<CreateCredentialRequest, z.ZodTypeDef, unknown>;
export type CreateCredentialResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialReferenceResponse?: CredentialReferenceResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateCredentialResponse$zodSchema: z.ZodType<CreateCredentialResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialop.d.ts.map