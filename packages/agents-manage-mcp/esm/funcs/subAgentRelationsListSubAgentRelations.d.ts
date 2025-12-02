import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListSubAgentRelationsRequest, type ListSubAgentRelationsResponse } from '../models/listsubagentrelationsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListSubAgentRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Sub Agent Relations
 */
export declare function subAgentRelationsListSubAgentRelations(client$: InkeepAgentsCore, request: ListSubAgentRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubAgentRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsListSubAgentRelations.d.ts.map