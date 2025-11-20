import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ExternalAgentResponse } from "./externalagentresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetExternalAgentByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetExternalAgentByIdRequest$zodSchema: z.ZodType<GetExternalAgentByIdRequest, z.ZodTypeDef, unknown>;
export type GetExternalAgentByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExternalAgentResponse?: ExternalAgentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetExternalAgentByIdResponse$zodSchema: z.ZodType<GetExternalAgentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getexternalagentbyidop.d.ts.map