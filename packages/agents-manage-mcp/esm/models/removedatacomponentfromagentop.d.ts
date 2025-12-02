import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type RemovedResponse } from './removedresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type RemoveDataComponentFromAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    dataComponentId: string;
};
export declare const RemoveDataComponentFromAgentRequest$zodSchema: z.ZodType<RemoveDataComponentFromAgentRequest, z.ZodTypeDef, unknown>;
export type RemoveDataComponentFromAgentResponse = {
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
export declare const RemoveDataComponentFromAgentResponse$zodSchema: z.ZodType<RemoveDataComponentFromAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=removedatacomponentfromagentop.d.ts.map