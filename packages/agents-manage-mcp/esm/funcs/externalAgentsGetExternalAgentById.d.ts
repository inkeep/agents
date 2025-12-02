import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetExternalAgentByIdRequest, type GetExternalAgentByIdResponse } from '../models/getexternalagentbyidop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetExternalAgentByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get External Agent
 */
export declare function externalAgentsGetExternalAgentById(client$: InkeepAgentsCore, request: GetExternalAgentByIdRequest, options?: RequestOptions): APIPromise<Result<GetExternalAgentByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=externalAgentsGetExternalAgentById.d.ts.map