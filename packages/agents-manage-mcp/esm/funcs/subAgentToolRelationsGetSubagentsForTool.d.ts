import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetSubagentsForToolRequest, GetSubagentsForToolResponse } from "../models/getsubagentsfortoolop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetSubagentsForToolAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get SubAgents for Tool
 */
export declare function subAgentToolRelationsGetSubagentsForTool(client$: InkeepAgentsCore, request: GetSubagentsForToolRequest, options?: RequestOptions): APIPromise<Result<GetSubagentsForToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsGetSubagentsForTool.d.ts.map