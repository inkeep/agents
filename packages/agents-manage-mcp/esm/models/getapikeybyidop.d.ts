import * as z from 'zod';
import { type ApiKeyResponse } from './apikeyresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetApiKeyByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetApiKeyByIdRequest$zodSchema: z.ZodType<GetApiKeyByIdRequest, z.ZodTypeDef, unknown>;
export type GetApiKeyByIdResponse = {
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
export declare const GetApiKeyByIdResponse$zodSchema: z.ZodType<GetApiKeyByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getapikeybyidop.d.ts.map