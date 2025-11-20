import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteFunctionToolRequest, DeleteFunctionToolResponse } from "../models/deletefunctiontoolop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Function Tool
 */
export declare function functionToolsDeleteFunctionTool(client$: InkeepAgentsCore, request: DeleteFunctionToolRequest, options?: RequestOptions): APIPromise<Result<DeleteFunctionToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionToolsDeleteFunctionTool.d.ts.map