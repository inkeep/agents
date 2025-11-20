import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListSubAgentExternalAgentRelationsRequest, ListSubAgentExternalAgentRelationsResponse } from "../models/listsubagentexternalagentrelationsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListSubAgentExternalAgentRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Sub Agent External Agent Relations
 */
export declare function subAgentExternalAgentRelationsListSubAgentExternalAgentRelations(client$: InkeepAgentsCore, request: ListSubAgentExternalAgentRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubAgentExternalAgentRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsListSubAgentExternalAgentRelations.d.ts.map