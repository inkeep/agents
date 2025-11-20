import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateFullAgentRequest, CreateFullAgentResponse } from "../models/createfullagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateFullAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Full Agent
 *
 * @remarks
 * Create a complete agent with all agents, tools, and relationships from JSON definition
 */
export declare function fullAgentCreateFullAgent(client$: InkeepAgentsCore, request: CreateFullAgentRequest, options?: RequestOptions): APIPromise<Result<CreateFullAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullAgentCreateFullAgent.d.ts.map