import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ErrorResponse } from "./errorresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentArtifactComponentResponse } from "./subagentartifactcomponentresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type AssociateArtifactComponentWithAgentRequestBody = {
    agentId: string;
    subAgentId: string;
    artifactComponentId: string;
};
export declare const AssociateArtifactComponentWithAgentRequestBody$zodSchema: z.ZodType<AssociateArtifactComponentWithAgentRequestBody, z.ZodTypeDef, unknown>;
export type AssociateArtifactComponentWithAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: AssociateArtifactComponentWithAgentRequestBody | undefined;
};
export declare const AssociateArtifactComponentWithAgentRequest$zodSchema: z.ZodType<AssociateArtifactComponentWithAgentRequest, z.ZodTypeDef, unknown>;
export type AssociateArtifactComponentWithAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentArtifactComponentResponse?: SubAgentArtifactComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const AssociateArtifactComponentWithAgentResponse$zodSchema: z.ZodType<AssociateArtifactComponentWithAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=associateartifactcomponentwithagentop.d.ts.map