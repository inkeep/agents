import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateToolRequest, UpdateToolResponse } from "../models/updatetoolop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateToolAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Tool
 */
export declare function toolsUpdateTool(client$: InkeepAgentsCore, request: UpdateToolRequest, options?: RequestOptions): APIPromise<Result<UpdateToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=toolsUpdateTool.d.ts.map