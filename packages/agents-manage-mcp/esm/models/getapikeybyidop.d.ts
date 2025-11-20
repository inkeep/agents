import * as z from "zod";
import { ApiKeyResponse } from "./apikeyresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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