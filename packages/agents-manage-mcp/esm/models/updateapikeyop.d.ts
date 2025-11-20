import * as z from "zod";
import { ApiKeyResponse } from "./apikeyresponse.js";
import { ApiKeyUpdate } from "./apikeyupdate.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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