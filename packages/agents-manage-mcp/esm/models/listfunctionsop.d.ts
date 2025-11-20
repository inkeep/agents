import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FunctionListResponse } from "./functionlistresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListFunctionsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListFunctionsRequest$zodSchema: z.ZodType<ListFunctionsRequest, z.ZodTypeDef, unknown>;
export type ListFunctionsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FunctionListResponse?: FunctionListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListFunctionsResponse$zodSchema: z.ZodType<ListFunctionsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listfunctionsop.d.ts.map