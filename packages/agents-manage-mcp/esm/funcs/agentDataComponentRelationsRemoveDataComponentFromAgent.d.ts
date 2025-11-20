import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { RemoveDataComponentFromAgentRequest, RemoveDataComponentFromAgentResponse } from "../models/removedatacomponentfromagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum RemoveDataComponentFromAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Remove Data Component from Agent
 */
export declare function agentDataComponentRelationsRemoveDataComponentFromAgent(client$: InkeepAgentsCore, request: RemoveDataComponentFromAgentRequest, options?: RequestOptions): APIPromise<Result<RemoveDataComponentFromAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsRemoveDataComponentFromAgent.d.ts.map