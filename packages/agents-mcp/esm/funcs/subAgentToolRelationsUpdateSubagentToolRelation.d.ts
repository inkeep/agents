import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateSubagentToolRelationRequest, type UpdateSubagentToolRelationResponse } from '../models/updatesubagenttoolrelationop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum UpdateSubagentToolRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update SubAgent Tool Relation
 */
export declare function subAgentToolRelationsUpdateSubagentToolRelation(client$: InkeepAgentsCore, request: UpdateSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsUpdateSubagentToolRelation.d.ts.map