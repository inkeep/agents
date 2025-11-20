import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListSubagentToolRelationsRequest, ListSubagentToolRelationsResponse } from "../models/listsubagenttoolrelationsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListSubagentToolRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List SubAgent Tool Relations
 */
export declare function subAgentToolRelationsListSubagentToolRelations(client$: InkeepAgentsCore, request: ListSubagentToolRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubagentToolRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsListSubagentToolRelations.d.ts.map