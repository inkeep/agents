import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FunctionToolListResponse } from "./functiontoollistresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListFunctionToolsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListFunctionToolsRequest$zodSchema: z.ZodType<ListFunctionToolsRequest, z.ZodTypeDef, unknown>;
export type ListFunctionToolsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FunctionToolListResponse?: FunctionToolListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListFunctionToolsResponse$zodSchema: z.ZodType<ListFunctionToolsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listfunctiontoolsop.d.ts.map