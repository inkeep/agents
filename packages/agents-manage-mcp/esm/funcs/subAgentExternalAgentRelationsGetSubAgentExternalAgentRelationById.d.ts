import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetSubAgentExternalAgentRelationByIdRequest, GetSubAgentExternalAgentRelationByIdResponse } from "../models/getsubagentexternalagentrelationbyidop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetSubAgentExternalAgentRelationByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsGetSubAgentExternalAgentRelationById(client$: InkeepAgentsCore, request: GetSubAgentExternalAgentRelationByIdRequest, options?: RequestOptions): APIPromise<Result<GetSubAgentExternalAgentRelationByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsGetSubAgentExternalAgentRelationById.d.ts.map