import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetFullAgentRequest, GetFullAgentResponse } from "../models/getfullagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetFullAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Full Agent
 *
 * @remarks
 * Retrieve a complete agent definition with all agents, tools, and relationships
 */
export declare function fullAgentGetFullAgent(client$: InkeepAgentsCore, request: GetFullAgentRequest, options?: RequestOptions): APIPromise<Result<GetFullAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullAgentGetFullAgent.d.ts.map