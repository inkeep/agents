import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { McpToolListResponse } from "./mcptoollistresponse.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export declare const ListToolsStatus$zodSchema: z.ZodEnum<["healthy", "unhealthy", "unknown", "needs_auth"]>;
export type ListToolsStatus = z.infer<typeof ListToolsStatus$zodSchema>;
export type ListToolsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
    status?: ListToolsStatus | undefined;
};
export declare const ListToolsRequest$zodSchema: z.ZodType<ListToolsRequest, z.ZodTypeDef, unknown>;
export type ListToolsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    McpToolListResponse?: McpToolListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListToolsResponse$zodSchema: z.ZodType<ListToolsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listtoolsop.d.ts.map