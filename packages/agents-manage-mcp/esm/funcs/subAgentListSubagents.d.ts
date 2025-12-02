import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListSubagentsRequest, type ListSubagentsResponse } from '../models/listsubagentsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListSubagentsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List SubAgents
 */
export declare function subAgentListSubagents(client$: InkeepAgentsCore, request: ListSubagentsRequest, options?: RequestOptions): APIPromise<Result<ListSubagentsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentListSubagents.d.ts.map