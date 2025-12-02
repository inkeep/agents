import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ErrorResponse } from './errorresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentDataComponentResponse } from './subagentdatacomponentresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type AssociateDataComponentWithAgentRequestBody = {
    agentId: string;
    subAgentId: string;
    dataComponentId: string;
};
export declare const AssociateDataComponentWithAgentRequestBody$zodSchema: z.ZodType<AssociateDataComponentWithAgentRequestBody, z.ZodTypeDef, unknown>;
export type AssociateDataComponentWithAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: AssociateDataComponentWithAgentRequestBody | undefined;
};
export declare const AssociateDataComponentWithAgentRequest$zodSchema: z.ZodType<AssociateDataComponentWithAgentRequest, z.ZodTypeDef, unknown>;
export type AssociateDataComponentWithAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentDataComponentResponse?: SubAgentDataComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const AssociateDataComponentWithAgentResponse$zodSchema: z.ZodType<AssociateDataComponentWithAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=associatedatacomponentwithagentop.d.ts.map