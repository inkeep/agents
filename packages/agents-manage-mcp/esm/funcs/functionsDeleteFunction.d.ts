import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteFunctionRequest, DeleteFunctionResponse } from "../models/deletefunctionop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Function
 */
export declare function functionsDeleteFunction(client$: InkeepAgentsCore, request: DeleteFunctionRequest, options?: RequestOptions): APIPromise<Result<DeleteFunctionResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionsDeleteFunction.d.ts.map