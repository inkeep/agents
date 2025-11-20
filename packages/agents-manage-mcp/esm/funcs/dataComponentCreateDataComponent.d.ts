import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateDataComponentRequest, CreateDataComponentResponse } from "../models/createdatacomponentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateDataComponentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Data Component
 */
export declare function dataComponentCreateDataComponent(client$: InkeepAgentsCore, request: CreateDataComponentRequest, options?: RequestOptions): APIPromise<Result<CreateDataComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=dataComponentCreateDataComponent.d.ts.map