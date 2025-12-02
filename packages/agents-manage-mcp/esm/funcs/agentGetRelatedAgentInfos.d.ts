import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetRelatedAgentInfosRequest, type GetRelatedAgentInfosResponse } from '../models/getrelatedagentinfosop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetRelatedAgentInfosAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Related Agent Infos
 */
export declare function agentGetRelatedAgentInfos(client$: InkeepAgentsCore, request: GetRelatedAgentInfosRequest, options?: RequestOptions): APIPromise<Result<GetRelatedAgentInfosResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentGetRelatedAgentInfos.d.ts.map