import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateSubAgentTeamAgentRelationRequest, CreateSubAgentTeamAgentRelationResponse } from "../models/createsubagentteamagentrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateSubAgentTeamAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsCreateSubAgentTeamAgentRelation(client$: InkeepAgentsCore, request: CreateSubAgentTeamAgentRelationRequest, options?: RequestOptions): APIPromise<Result<CreateSubAgentTeamAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsCreateSubAgentTeamAgentRelation.d.ts.map