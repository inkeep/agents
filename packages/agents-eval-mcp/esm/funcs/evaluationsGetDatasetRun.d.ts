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
import { GetDatasetRunRequest, GetDatasetRunResponse } from '../models/getdatasetrunop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetDatasetRunAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Dataset Run
 */
export declare function evaluationsGetDatasetRun(
  client$: InkeepAgentsCore,
  request: GetDatasetRunRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetDatasetRunResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetDatasetRun.d.ts.map
