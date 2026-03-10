import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  DeleteDatasetRunConfigRequest,
  DeleteDatasetRunConfigResponse,
} from '../models/deletedatasetrunconfigop.js';
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
 * Delete Dataset Run Config
 */
export declare function evaluationsDeleteDatasetRunConfig(
  client$: InkeepAgentsCore,
  request: DeleteDatasetRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    DeleteDatasetRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsDeleteDatasetRunConfig.d.ts.map
