import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetSubagentToolRelationRequest, GetSubagentToolRelationResponse } from "../models/getsubagenttoolrelationop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetSubagentToolRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get SubAgent Tool Relation
 */
export declare function subAgentToolRelationsGetSubagentToolRelation(client$: InkeepAgentsCore, request: GetSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<GetSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsGetSubagentToolRelation.d.ts.map