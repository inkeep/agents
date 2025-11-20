import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ExternalAgentResponse } from "./externalagentresponse.js";
import { ExternalAgentUpdate } from "./externalagentupdate.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateExternalAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: ExternalAgentUpdate | undefined;
};
export declare const UpdateExternalAgentRequest$zodSchema: z.ZodType<UpdateExternalAgentRequest, z.ZodTypeDef, unknown>;
export type UpdateExternalAgentResponse = {
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
export declare const UpdateExternalAgentResponse$zodSchema: z.ZodType<UpdateExternalAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateexternalagentop.d.ts.map