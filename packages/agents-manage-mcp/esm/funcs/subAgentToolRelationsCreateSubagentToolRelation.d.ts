import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateSubagentToolRelationRequest, CreateSubagentToolRelationResponse } from "../models/createsubagenttoolrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateSubagentToolRelationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create SubAgent Tool Relation
 */
export declare function subAgentToolRelationsCreateSubagentToolRelation(client$: InkeepAgentsCore, request: CreateSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<CreateSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsCreateSubagentToolRelation.d.ts.map