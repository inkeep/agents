import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateExternalAgentRequest, CreateExternalAgentResponse } from "../models/createexternalagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateExternalAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create External Agent
 */
export declare function externalAgentsCreateExternalAgent(client$: InkeepAgentsCore, request: CreateExternalAgentRequest, options?: RequestOptions): APIPromise<Result<CreateExternalAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=externalAgentsCreateExternalAgent.d.ts.map