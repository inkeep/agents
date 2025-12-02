import * as z from 'zod';
import { type ApiKey } from './apikey.js';
import { type ApiKeyCreate } from './apikeycreate.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateApiKeyRequest = {
    tenantId: string;
    projectId: string;
    body?: ApiKeyCreate | undefined;
};
export declare const CreateApiKeyRequest$zodSchema: z.ZodType<CreateApiKeyRequest, z.ZodTypeDef, unknown>;
export type CreateApiKeyData = {
    apiKey: ApiKey;
    key: string;
};
export declare const CreateApiKeyData$zodSchema: z.ZodType<CreateApiKeyData, z.ZodTypeDef, unknown>;
/**
 * API key created successfully
 */
export type CreateApiKeyResponseBody = {
    data: CreateApiKeyData;
};
export declare const CreateApiKeyResponseBody$zodSchema: z.ZodType<CreateApiKeyResponseBody, z.ZodTypeDef, unknown>;
export type CreateApiKeyResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    object?: CreateApiKeyResponseBody | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateApiKeyResponse$zodSchema: z.ZodType<CreateApiKeyResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createapikeyop.d.ts.map