import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetDataComponentsForAgentRequest, GetDataComponentsForAgentResponse } from "../models/getdatacomponentsforagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetDataComponentsForAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Data Components for Agent
 */
export declare function agentDataComponentRelationsGetDataComponentsForAgent(client$: InkeepAgentsCore, request: GetDataComponentsForAgentRequest, options?: RequestOptions): APIPromise<Result<GetDataComponentsForAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsGetDataComponentsForAgent.d.ts.map