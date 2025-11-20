import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteFullAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
};
export declare const DeleteFullAgentRequest$zodSchema: z.ZodType<DeleteFullAgentRequest, z.ZodTypeDef, unknown>;
export type DeleteFullAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteFullAgentResponse$zodSchema: z.ZodType<DeleteFullAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletefullagentop.d.ts.map