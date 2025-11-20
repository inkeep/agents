import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FunctionToolCreate } from "./functiontoolcreate.js";
import { FunctionToolResponse } from "./functiontoolresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateFunctionToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: FunctionToolCreate | undefined;
};
export declare const CreateFunctionToolRequest$zodSchema: z.ZodType<CreateFunctionToolRequest, z.ZodTypeDef, unknown>;
export type CreateFunctionToolResponse = {
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
export declare const CreateFunctionToolResponse$zodSchema: z.ZodType<CreateFunctionToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createfunctiontoolop.d.ts.map