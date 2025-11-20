import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListSubagentToolRelationsRequest, type ListSubagentToolRelationsResponse } from '../models/listsubagenttoolrelationsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListSubagentToolRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List SubAgent Tool Relations
 */
export declare function subAgentToolRelationsListSubagentToolRelations(client$: InkeepAgentsCore, request: ListSubagentToolRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubagentToolRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsListSubagentToolRelations.d.ts.map