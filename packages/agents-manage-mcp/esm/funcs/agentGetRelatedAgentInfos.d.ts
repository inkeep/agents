import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetRelatedAgentInfosRequest, GetRelatedAgentInfosResponse } from "../models/getrelatedagentinfosop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetRelatedAgentInfosAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Related Agent Infos
 */
export declare function agentGetRelatedAgentInfos(client$: InkeepAgentsCore, request: GetRelatedAgentInfosRequest, options?: RequestOptions): APIPromise<Result<GetRelatedAgentInfosResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentGetRelatedAgentInfos.d.ts.map