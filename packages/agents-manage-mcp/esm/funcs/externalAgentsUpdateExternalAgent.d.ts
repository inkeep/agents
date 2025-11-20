import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateExternalAgentRequest, UpdateExternalAgentResponse } from "../models/updateexternalagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateExternalAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update External Agent
 */
export declare function externalAgentsUpdateExternalAgent(client$: InkeepAgentsCore, request: UpdateExternalAgentRequest, options?: RequestOptions): APIPromise<Result<UpdateExternalAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=externalAgentsUpdateExternalAgent.d.ts.map