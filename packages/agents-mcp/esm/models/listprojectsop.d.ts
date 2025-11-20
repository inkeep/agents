import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type ProjectListResponse } from './projectlistresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListProjectsRequest = {
    tenantId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListProjectsRequest$zodSchema: z.ZodType<ListProjectsRequest, z.ZodTypeDef, unknown>;
export type ListProjectsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ProjectListResponse?: ProjectListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListProjectsResponse$zodSchema: z.ZodType<ListProjectsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listprojectsop.d.ts.map