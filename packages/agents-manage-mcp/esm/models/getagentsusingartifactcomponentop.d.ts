import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ComponentAssociationListResponse } from "./componentassociationlistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetAgentsUsingArtifactComponentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    artifactComponentId: string;
};
export declare const GetAgentsUsingArtifactComponentRequest$zodSchema: z.ZodType<GetAgentsUsingArtifactComponentRequest, z.ZodTypeDef, unknown>;
export type GetAgentsUsingArtifactComponentResponse = {
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
export declare const GetAgentsUsingArtifactComponentResponse$zodSchema: z.ZodType<GetAgentsUsingArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getagentsusingartifactcomponentop.d.ts.map