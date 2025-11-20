import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { ProjectListResponse } from "./projectlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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