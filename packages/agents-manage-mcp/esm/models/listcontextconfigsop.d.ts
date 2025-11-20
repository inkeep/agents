import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ContextConfigListResponse } from "./contextconfiglistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListContextConfigsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListContextConfigsRequest$zodSchema: z.ZodType<ListContextConfigsRequest, z.ZodTypeDef, unknown>;
export type ListContextConfigsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ContextConfigListResponse?: ContextConfigListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListContextConfigsResponse$zodSchema: z.ZodType<ListContextConfigsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcontextconfigsop.d.ts.map