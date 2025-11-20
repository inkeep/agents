import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateSubAgentTeamAgentRelationRequest, UpdateSubAgentTeamAgentRelationResponse } from "../models/updatesubagentteamagentrelationop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateSubAgentTeamAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsUpdateSubAgentTeamAgentRelation(client$: InkeepAgentsCore, request: UpdateSubAgentTeamAgentRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubAgentTeamAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsUpdateSubAgentTeamAgentRelation.d.ts.map