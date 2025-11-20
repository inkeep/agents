import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetSubAgentRelationByIdRequest, type GetSubAgentRelationByIdResponse } from '../models/getsubagentrelationbyidop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetSubAgentRelationByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Sub Agent Relation
 */
export declare function subAgentRelationsGetSubAgentRelationById(client$: InkeepAgentsCore, request: GetSubAgentRelationByIdRequest, options?: RequestOptions): APIPromise<Result<GetSubAgentRelationByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsGetSubAgentRelationById.d.ts.map