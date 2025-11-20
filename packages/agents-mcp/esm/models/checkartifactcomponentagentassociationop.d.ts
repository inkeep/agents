import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ExistsResponse } from './existsresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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