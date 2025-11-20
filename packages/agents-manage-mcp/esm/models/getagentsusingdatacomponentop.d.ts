import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ComponentAssociationListResponse } from "./componentassociationlistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetAgentsUsingDataComponentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    dataComponentId: string;
};
export declare const GetAgentsUsingDataComponentRequest$zodSchema: z.ZodType<GetAgentsUsingDataComponentRequest, z.ZodTypeDef, unknown>;
export type GetAgentsUsingDataComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ComponentAssociationListResponse?: ComponentAssociationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetAgentsUsingDataComponentResponse$zodSchema: z.ZodType<GetAgentsUsingDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getagentsusingdatacomponentop.d.ts.map