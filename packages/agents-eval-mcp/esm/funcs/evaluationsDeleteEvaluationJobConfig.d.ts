import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  DeleteEvaluationJobConfigRequest,
  DeleteEvaluationJobConfigResponse,
} from '../models/deleteevaluationjobconfigop.js';
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
 * Delete Evaluation Job Config
 */
export declare function evaluationsDeleteEvaluationJobConfig(
  client$: InkeepAgentsCore,
  request: DeleteEvaluationJobConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    DeleteEvaluationJobConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsDeleteEvaluationJobConfig.d.ts.map
