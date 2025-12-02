import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateContextConfigRequest, type CreateContextConfigResponse } from '../models/createcontextconfigop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateContextConfigAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Context Configuration
 */
export declare function contextConfigCreateContextConfig(client$: InkeepAgentsCore, request: CreateContextConfigRequest, options?: RequestOptions): APIPromise<Result<CreateContextConfigResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=contextConfigCreateContextConfig.d.ts.map