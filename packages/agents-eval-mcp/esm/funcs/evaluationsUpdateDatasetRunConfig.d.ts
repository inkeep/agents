import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import { APIError } from '../models/errors/apierror.js';
import {
  ConnectionError,
  InvalidRequestError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '../models/errors/httpclienterrors.js';
import { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import {
  UpdateDatasetRunConfigRequest,
  UpdateDatasetRunConfigResponse,
} from '../models/updatedatasetrunconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateDatasetRunConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Dataset Run Config
 */
export declare function evaluationsUpdateDatasetRunConfig(
  client$: InkeepAgentsCore,
  request: UpdateDatasetRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateDatasetRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateDatasetRunConfig.d.ts.map
