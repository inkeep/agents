import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetFullAgentDefinitionRequest, GetFullAgentDefinitionResponse } from "../models/getfullagentdefinitionop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetFullAgentDefinitionAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Full Agent Definition
 */
export declare function agentGetFullAgentDefinition(client$: InkeepAgentsCore, request: GetFullAgentDefinitionRequest, options?: RequestOptions): APIPromise<Result<GetFullAgentDefinitionResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentGetFullAgentDefinition.d.ts.map