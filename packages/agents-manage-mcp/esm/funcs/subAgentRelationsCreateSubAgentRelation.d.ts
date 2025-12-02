import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateSubAgentRelationRequest, type CreateSubAgentRelationResponse } from '../models/createsubagentrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateSubAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Sub Agent Relation
 */
export declare function subAgentRelationsCreateSubAgentRelation(client$: InkeepAgentsCore, request: CreateSubAgentRelationRequest, options?: RequestOptions): APIPromise<Result<CreateSubAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsCreateSubAgentRelation.d.ts.map