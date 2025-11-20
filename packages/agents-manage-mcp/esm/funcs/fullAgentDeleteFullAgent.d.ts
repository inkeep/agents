import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteFullAgentRequest, DeleteFullAgentResponse } from "../models/deletefullagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Full Agent
 *
 * @remarks
 * Delete a complete agent and cascade to all related entities (relationships, not other agents/tools)
 */
export declare function fullAgentDeleteFullAgent(client$: InkeepAgentsCore, request: DeleteFullAgentRequest, options?: RequestOptions): APIPromise<Result<DeleteFullAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullAgentDeleteFullAgent.d.ts.map