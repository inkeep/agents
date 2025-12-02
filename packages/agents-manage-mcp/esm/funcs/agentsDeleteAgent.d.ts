import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteAgentRequest, type DeleteAgentResponse } from '../models/deleteagentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Agent
 */
export declare function agentsDeleteAgent(client$: InkeepAgentsCore, request: DeleteAgentRequest, options?: RequestOptions): APIPromise<Result<DeleteAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentsDeleteAgent.d.ts.map