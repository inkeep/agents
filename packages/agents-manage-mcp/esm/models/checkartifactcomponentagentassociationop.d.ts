import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ExistsResponse } from "./existsresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CheckArtifactComponentAgentAssociationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    artifactComponentId: string;
};
export declare const CheckArtifactComponentAgentAssociationRequest$zodSchema: z.ZodType<CheckArtifactComponentAgentAssociationRequest, z.ZodTypeDef, unknown>;
export type CheckArtifactComponentAgentAssociationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExistsResponse?: ExistsResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CheckArtifactComponentAgentAssociationResponse$zodSchema: z.ZodType<CheckArtifactComponentAgentAssociationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=checkartifactcomponentagentassociationop.d.ts.map