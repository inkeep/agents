import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteContextConfigRequest, DeleteContextConfigResponse } from "../models/deletecontextconfigop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Context Configuration
 */
export declare function contextConfigDeleteContextConfig(client$: InkeepAgentsCore, request: DeleteContextConfigRequest, options?: RequestOptions): APIPromise<Result<DeleteContextConfigResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=contextConfigDeleteContextConfig.d.ts.map