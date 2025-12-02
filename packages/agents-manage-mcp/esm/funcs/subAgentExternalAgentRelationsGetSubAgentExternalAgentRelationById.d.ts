import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetSubAgentExternalAgentRelationByIdRequest, type GetSubAgentExternalAgentRelationByIdResponse } from '../models/getsubagentexternalagentrelationbyidop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetSubAgentExternalAgentRelationByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsGetSubAgentExternalAgentRelationById(client$: InkeepAgentsCore, request: GetSubAgentExternalAgentRelationByIdRequest, options?: RequestOptions): APIPromise<Result<GetSubAgentExternalAgentRelationByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsGetSubAgentExternalAgentRelationById.d.ts.map