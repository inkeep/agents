import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateSubagentRequest, CreateSubagentResponse } from "../models/createsubagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateSubagentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create SubAgent
 */
export declare function subAgentCreateSubagent(client$: InkeepAgentsCore, request: CreateSubagentRequest, options?: RequestOptions): APIPromise<Result<CreateSubagentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentCreateSubagent.d.ts.map