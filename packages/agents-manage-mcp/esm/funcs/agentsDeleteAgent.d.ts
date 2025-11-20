import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteAgentRequest, DeleteAgentResponse } from "../models/deleteagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Agent
 */
export declare function agentsDeleteAgent(client$: InkeepAgentsCore, request: DeleteAgentRequest, options?: RequestOptions): APIPromise<Result<DeleteAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentsDeleteAgent.d.ts.map