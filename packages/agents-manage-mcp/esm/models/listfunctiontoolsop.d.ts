import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FunctionToolListResponse } from './functiontoollistresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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