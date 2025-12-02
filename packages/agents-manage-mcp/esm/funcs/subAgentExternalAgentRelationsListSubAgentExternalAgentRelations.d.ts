import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListSubAgentExternalAgentRelationsRequest, type ListSubAgentExternalAgentRelationsResponse } from '../models/listsubagentexternalagentrelationsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListSubAgentExternalAgentRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Sub Agent External Agent Relations
 */
export declare function subAgentExternalAgentRelationsListSubAgentExternalAgentRelations(client$: InkeepAgentsCore, request: ListSubAgentExternalAgentRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubAgentExternalAgentRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsListSubAgentExternalAgentRelations.d.ts.map