import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateSubAgentExternalAgentRelationRequest, CreateSubAgentExternalAgentRelationResponse } from "../models/createsubagentexternalagentrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateSubAgentExternalAgentRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsCreateSubAgentExternalAgentRelation(client$: InkeepAgentsCore, request: CreateSubAgentExternalAgentRelationRequest, options?: RequestOptions): APIPromise<Result<CreateSubAgentExternalAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsCreateSubAgentExternalAgentRelation.d.ts.map