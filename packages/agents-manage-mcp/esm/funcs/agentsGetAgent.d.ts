import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetAgentRequest, GetAgentResponse } from "../models/getagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Agent
 */
export declare function agentsGetAgent(client$: InkeepAgentsCore, request: GetAgentRequest, options?: RequestOptions): APIPromise<Result<GetAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentsGetAgent.d.ts.map