import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type CreateCredentialInStoreRequest } from './createcredentialinstorerequest.js';
import { type CreateCredentialInStoreResponse } from './createcredentialinstoreresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateCredentialInStoreRequestRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: CreateCredentialInStoreRequest | undefined;
};
export declare const CreateCredentialInStoreRequestRequest$zodSchema: z.ZodType<CreateCredentialInStoreRequestRequest, z.ZodTypeDef, unknown>;
export type CreateCredentialInStoreResponseResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CreateCredentialInStoreResponse?: CreateCredentialInStoreResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateCredentialInStoreResponseResponse$zodSchema: z.ZodType<CreateCredentialInStoreResponseResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialinstoreop.d.ts.map