import * as z from 'zod';
import { type ApiKeyResponse } from './apikeyresponse.js';
import { type ApiKeyUpdate } from './apikeyupdate.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateApiKeyRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: ApiKeyUpdate | undefined;
};
export declare const UpdateApiKeyRequest$zodSchema: z.ZodType<UpdateApiKeyRequest, z.ZodTypeDef, unknown>;
export type UpdateApiKeyResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ApiKeyResponse?: ApiKeyResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateApiKeyResponse$zodSchema: z.ZodType<UpdateApiKeyResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateapikeyop.d.ts.map