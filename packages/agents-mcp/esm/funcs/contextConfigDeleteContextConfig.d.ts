import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteContextConfigRequest, type DeleteContextConfigResponse } from '../models/deletecontextconfigop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Context Configuration
 */
export declare function contextConfigDeleteContextConfig(client$: InkeepAgentsCore, request: DeleteContextConfigRequest, options?: RequestOptions): APIPromise<Result<DeleteContextConfigResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=contextConfigDeleteContextConfig.d.ts.map