import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteFunctionToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteFunctionToolRequest$zodSchema: z.ZodType<DeleteFunctionToolRequest, z.ZodTypeDef, unknown>;
export type DeleteFunctionToolResponse = {
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
export declare const DeleteFunctionToolResponse$zodSchema: z.ZodType<DeleteFunctionToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletefunctiontoolop.d.ts.map