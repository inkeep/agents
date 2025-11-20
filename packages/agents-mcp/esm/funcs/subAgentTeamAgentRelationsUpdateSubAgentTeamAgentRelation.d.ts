import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateSubAgentTeamAgentRelationRequest, type UpdateSubAgentTeamAgentRelationResponse } from '../models/updatesubagentteamagentrelationop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum UpdateSubAgentTeamAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsUpdateSubAgentTeamAgentRelation(client$: InkeepAgentsCore, request: UpdateSubAgentTeamAgentRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubAgentTeamAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsUpdateSubAgentTeamAgentRelation.d.ts.map