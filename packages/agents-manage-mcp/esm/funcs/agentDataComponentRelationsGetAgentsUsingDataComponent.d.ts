import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetAgentsUsingDataComponentRequest, GetAgentsUsingDataComponentResponse } from "../models/getagentsusingdatacomponentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetAgentsUsingDataComponentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Agents Using Data Component
 */
export declare function agentDataComponentRelationsGetAgentsUsingDataComponent(client$: InkeepAgentsCore, request: GetAgentsUsingDataComponentRequest, options?: RequestOptions): APIPromise<Result<GetAgentsUsingDataComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsGetAgentsUsingDataComponent.d.ts.map