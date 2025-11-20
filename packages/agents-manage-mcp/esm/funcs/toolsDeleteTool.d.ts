import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteToolRequest, DeleteToolResponse } from "../models/deletetoolop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Tool
 */
export declare function toolsDeleteTool(client$: InkeepAgentsCore, request: DeleteToolRequest, options?: RequestOptions): APIPromise<Result<DeleteToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=toolsDeleteTool.d.ts.map