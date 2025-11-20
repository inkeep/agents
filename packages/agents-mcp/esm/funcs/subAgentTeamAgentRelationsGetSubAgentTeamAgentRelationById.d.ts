import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetSubAgentTeamAgentRelationByIdRequest, type GetSubAgentTeamAgentRelationByIdResponse } from '../models/getsubagentteamagentrelationbyidop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetSubAgentTeamAgentRelationByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsGetSubAgentTeamAgentRelationById(client$: InkeepAgentsCore, request: GetSubAgentTeamAgentRelationByIdRequest, options?: RequestOptions): APIPromise<Result<GetSubAgentTeamAgentRelationByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsGetSubAgentTeamAgentRelationById.d.ts.map