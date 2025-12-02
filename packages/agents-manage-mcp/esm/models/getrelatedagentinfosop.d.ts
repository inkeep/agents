import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type RelatedAgentInfoListResponse } from './relatedagentinfolistresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetRelatedAgentInfosRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
};
export declare const GetRelatedAgentInfosRequest$zodSchema: z.ZodType<GetRelatedAgentInfosRequest, z.ZodTypeDef, unknown>;
export type GetRelatedAgentInfosResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    RelatedAgentInfoListResponse?: RelatedAgentInfoListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetRelatedAgentInfosResponse$zodSchema: z.ZodType<GetRelatedAgentInfosResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getrelatedagentinfosop.d.ts.map