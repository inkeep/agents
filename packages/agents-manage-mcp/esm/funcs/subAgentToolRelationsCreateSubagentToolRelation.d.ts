import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateSubagentToolRelationRequest, type CreateSubagentToolRelationResponse } from '../models/createsubagenttoolrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateSubagentToolRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create SubAgent Tool Relation
 */
export declare function subAgentToolRelationsCreateSubagentToolRelation(client$: InkeepAgentsCore, request: CreateSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<CreateSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsCreateSubagentToolRelation.d.ts.map