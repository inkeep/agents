import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetDataComponentsForAgentRequest, type GetDataComponentsForAgentResponse } from '../models/getdatacomponentsforagentop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetDataComponentsForAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Data Components for Agent
 */
export declare function agentDataComponentRelationsGetDataComponentsForAgent(client$: InkeepAgentsCore, request: GetDataComponentsForAgentRequest, options?: RequestOptions): APIPromise<Result<GetDataComponentsForAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsGetDataComponentsForAgent.d.ts.map