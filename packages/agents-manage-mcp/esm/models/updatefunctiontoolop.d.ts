import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FunctionToolResponse } from "./functiontoolresponse.js";
import { FunctionToolUpdate } from "./functiontoolupdate.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateFunctionToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: FunctionToolUpdate | undefined;
};
export declare const UpdateFunctionToolRequest$zodSchema: z.ZodType<UpdateFunctionToolRequest, z.ZodTypeDef, unknown>;
export type UpdateFunctionToolResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FunctionToolResponse?: FunctionToolResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateFunctionToolResponse$zodSchema: z.ZodType<UpdateFunctionToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatefunctiontoolop.d.ts.map