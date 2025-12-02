import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListContextConfigsRequest, type ListContextConfigsResponse } from '../models/listcontextconfigsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListContextConfigsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Context Configurations
 */
export declare function contextConfigListContextConfigs(client$: InkeepAgentsCore, request: ListContextConfigsRequest, options?: RequestOptions): APIPromise<Result<ListContextConfigsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=contextConfigListContextConfigs.d.ts.map