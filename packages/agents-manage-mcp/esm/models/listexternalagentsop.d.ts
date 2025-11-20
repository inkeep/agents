import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ExternalAgentListResponse } from "./externalagentlistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListExternalAgentsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListExternalAgentsRequest$zodSchema: z.ZodType<ListExternalAgentsRequest, z.ZodTypeDef, unknown>;
export type ListExternalAgentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExternalAgentListResponse?: ExternalAgentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListExternalAgentsResponse$zodSchema: z.ZodType<ListExternalAgentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listexternalagentsop.d.ts.map