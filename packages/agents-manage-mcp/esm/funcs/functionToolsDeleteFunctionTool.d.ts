import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteFunctionToolRequest, type DeleteFunctionToolResponse } from '../models/deletefunctiontoolop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Function Tool
 */
export declare function functionToolsDeleteFunctionTool(client$: InkeepAgentsCore, request: DeleteFunctionToolRequest, options?: RequestOptions): APIPromise<Result<DeleteFunctionToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionToolsDeleteFunctionTool.d.ts.map