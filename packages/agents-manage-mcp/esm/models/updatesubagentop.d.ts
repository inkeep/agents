import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentResponse } from "./subagentresponse.js";
import { SubAgentUpdate } from "./subagentupdate.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateSubagentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentUpdate | undefined;
};
export declare const UpdateSubagentRequest$zodSchema: z.ZodType<UpdateSubagentRequest, z.ZodTypeDef, unknown>;
export type UpdateSubagentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentResponse?: SubAgentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateSubagentResponse$zodSchema: z.ZodType<UpdateSubagentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentop.d.ts.map