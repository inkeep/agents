import * as z from "zod";
import { ApiKeyListResponse } from "./apikeylistresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListApiKeysRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
    agentId?: string | undefined;
};
export declare const ListApiKeysRequest$zodSchema: z.ZodType<ListApiKeysRequest, z.ZodTypeDef, unknown>;
export type ListApiKeysResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ApiKeyListResponse?: ApiKeyListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListApiKeysResponse$zodSchema: z.ZodType<ListApiKeysResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listapikeysop.d.ts.map