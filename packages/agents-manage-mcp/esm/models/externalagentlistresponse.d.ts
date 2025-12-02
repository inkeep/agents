import * as z from 'zod';
import { type ExternalAgent } from './externalagent.js';
import { type Pagination } from './pagination.js';
export type ExternalAgentListResponse = {
    data: Array<ExternalAgent>;
    pagination: Pagination;
};
export declare const ExternalAgentListResponse$zodSchema: z.ZodType<ExternalAgentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=externalagentlistresponse.d.ts.map