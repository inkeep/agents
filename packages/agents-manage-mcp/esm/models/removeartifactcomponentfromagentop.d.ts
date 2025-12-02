import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type RemovedResponse } from './removedresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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