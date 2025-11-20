import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { ThirdPartyMCPServerResponse } from "./thirdpartymcpserverresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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