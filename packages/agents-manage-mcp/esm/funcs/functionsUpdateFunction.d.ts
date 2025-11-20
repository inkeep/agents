import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateFunctionRequest, UpdateFunctionResponse } from "../models/updatefunctionop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateFunctionAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Function
 */
export declare function functionsUpdateFunction(client$: InkeepAgentsCore, request: UpdateFunctionRequest, options?: RequestOptions): APIPromise<Result<UpdateFunctionResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionsUpdateFunction.d.ts.map