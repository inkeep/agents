import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FunctionToolResponse } from "./functiontoolresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetFunctionToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetFunctionToolRequest$zodSchema: z.ZodType<GetFunctionToolRequest, z.ZodTypeDef, unknown>;
export type GetFunctionToolResponse = {
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
export declare const GetFunctionToolResponse$zodSchema: z.ZodType<GetFunctionToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfunctiontoolop.d.ts.map