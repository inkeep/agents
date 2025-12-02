import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteDataComponentRequest, type DeleteDataComponentResponse } from '../models/deletedatacomponentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Data Component
 */
export declare function dataComponentDeleteDataComponent(client$: InkeepAgentsCore, request: DeleteDataComponentRequest, options?: RequestOptions): APIPromise<Result<DeleteDataComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=dataComponentDeleteDataComponent.d.ts.map