import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateSubAgentRelationRequest, type UpdateSubAgentRelationResponse } from '../models/updatesubagentrelationop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum UpdateSubAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Sub Agent Relation
 */
export declare function subAgentRelationsUpdateSubAgentRelation(client$: InkeepAgentsCore, request: UpdateSubAgentRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsUpdateSubAgentRelation.d.ts.map