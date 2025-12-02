import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type CredentialReferenceResponse } from './credentialreferenceresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetCredentialByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetCredentialByIdRequest$zodSchema: z.ZodType<GetCredentialByIdRequest, z.ZodTypeDef, unknown>;
export type GetCredentialByIdResponse = {
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
export declare const GetCredentialByIdResponse$zodSchema: z.ZodType<GetCredentialByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getcredentialbyidop.d.ts.map