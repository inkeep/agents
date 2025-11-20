import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateSubAgentRelationRequest, UpdateSubAgentRelationResponse } from "../models/updatesubagentrelationop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateSubAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Sub Agent Relation
 */
export declare function subAgentRelationsUpdateSubAgentRelation(client$: InkeepAgentsCore, request: UpdateSubAgentRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsUpdateSubAgentRelation.d.ts.map