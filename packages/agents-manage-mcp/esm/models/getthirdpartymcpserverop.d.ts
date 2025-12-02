import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type ThirdPartyMCPServerResponse } from './thirdpartymcpserverresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetThirdPartyMcpServerRequestBody = {
    url: string;
};
export declare const GetThirdPartyMcpServerRequestBody$zodSchema: z.ZodType<GetThirdPartyMcpServerRequestBody, z.ZodTypeDef, unknown>;
export type GetThirdPartyMcpServerRequest = {
    tenantId: string;
    projectId: string;
    body?: GetThirdPartyMcpServerRequestBody | undefined;
};
export declare const GetThirdPartyMcpServerRequest$zodSchema: z.ZodType<GetThirdPartyMcpServerRequest, z.ZodTypeDef, unknown>;
export type GetThirdPartyMcpServerResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ThirdPartyMCPServerResponse?: ThirdPartyMCPServerResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetThirdPartyMcpServerResponse$zodSchema: z.ZodType<GetThirdPartyMcpServerResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getthirdpartymcpserverop.d.ts.map