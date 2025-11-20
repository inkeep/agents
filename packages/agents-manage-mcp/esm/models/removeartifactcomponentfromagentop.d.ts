import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { RemovedResponse } from "./removedresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type RemoveArtifactComponentFromAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    artifactComponentId: string;
};
export declare const RemoveArtifactComponentFromAgentRequest$zodSchema: z.ZodType<RemoveArtifactComponentFromAgentRequest, z.ZodTypeDef, unknown>;
export type RemoveArtifactComponentFromAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    RemovedResponse?: RemovedResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const RemoveArtifactComponentFromAgentResponse$zodSchema: z.ZodType<RemoveArtifactComponentFromAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=removeartifactcomponentfromagentop.d.ts.map