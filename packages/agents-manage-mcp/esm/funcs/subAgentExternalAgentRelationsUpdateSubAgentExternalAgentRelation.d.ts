import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateSubAgentExternalAgentRelationRequest, UpdateSubAgentExternalAgentRelationResponse } from "../models/updatesubagentexternalagentrelationop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateSubAgentExternalAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsUpdateSubAgentExternalAgentRelation(client$: InkeepAgentsCore, request: UpdateSubAgentExternalAgentRelationRequest, options?: RequestOptions): APIPromise<Result<UpdateSubAgentExternalAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsUpdateSubAgentExternalAgentRelation.d.ts.map