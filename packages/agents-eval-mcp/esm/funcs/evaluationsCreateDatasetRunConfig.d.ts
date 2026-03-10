import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateDatasetRunConfigRequest,
  CreateDatasetRunConfigResponse,
} from '../models/createdatasetrunconfigop.js';
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
export declare enum CreateDatasetRunConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Dataset Run Config
 */
export declare function evaluationsCreateDatasetRunConfig(
  client$: InkeepAgentsCore,
  request: CreateDatasetRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateDatasetRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateDatasetRunConfig.d.ts.map
