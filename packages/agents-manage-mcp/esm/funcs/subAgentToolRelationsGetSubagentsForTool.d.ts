import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetSubagentsForToolRequest, type GetSubagentsForToolResponse } from '../models/getsubagentsfortoolop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetSubagentsForToolAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get SubAgents for Tool
 */
export declare function subAgentToolRelationsGetSubagentsForTool(client$: InkeepAgentsCore, request: GetSubagentsForToolRequest, options?: RequestOptions): APIPromise<Result<GetSubagentsForToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsGetSubagentsForTool.d.ts.map