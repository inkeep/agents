import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetSubAgentTeamAgentRelationByIdRequest, GetSubAgentTeamAgentRelationByIdResponse } from "../models/getsubagentteamagentrelationbyidop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetSubAgentTeamAgentRelationByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsGetSubAgentTeamAgentRelationById(client$: InkeepAgentsCore, request: GetSubAgentTeamAgentRelationByIdRequest, options?: RequestOptions): APIPromise<Result<GetSubAgentTeamAgentRelationByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsGetSubAgentTeamAgentRelationById.d.ts.map