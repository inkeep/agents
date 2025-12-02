import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type DataComponentArrayResponse } from './datacomponentarrayresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetDataComponentsForAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
};
export declare const GetDataComponentsForAgentRequest$zodSchema: z.ZodType<GetDataComponentsForAgentRequest, z.ZodTypeDef, unknown>;
export type GetDataComponentsForAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    DataComponentArrayResponse?: DataComponentArrayResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetDataComponentsForAgentResponse$zodSchema: z.ZodType<GetDataComponentsForAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getdatacomponentsforagentop.d.ts.map