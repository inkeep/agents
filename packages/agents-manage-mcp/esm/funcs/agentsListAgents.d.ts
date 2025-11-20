import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListAgentsRequest, ListAgentsResponse } from "../models/listagentsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListAgentsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Agents
 */
export declare function agentsListAgents(client$: InkeepAgentsCore, request: ListAgentsRequest, options?: RequestOptions): APIPromise<Result<ListAgentsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentsListAgents.d.ts.map