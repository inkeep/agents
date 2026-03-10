import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import { DeleteDatasetRequest, DeleteDatasetResponse } from '../models/deletedatasetop.js';
import { APIError } from '../models/errors/apierror.js';
import {
  ConnectionError,
  InvalidRequestError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '../models/errors/httpclienterrors.js';
import { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
/**
 * Delete Dataset
 */
export declare function evaluationsDeleteDataset(
  client$: InkeepAgentsCore,
  request: DeleteDatasetRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    DeleteDatasetResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsDeleteDataset.d.ts.map
