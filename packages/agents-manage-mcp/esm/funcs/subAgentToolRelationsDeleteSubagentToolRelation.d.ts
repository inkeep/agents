import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteSubagentToolRelationRequest, DeleteSubagentToolRelationResponse } from "../models/deletesubagenttoolrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete SubAgent Tool Relation
 */
export declare function subAgentToolRelationsDeleteSubagentToolRelation(client$: InkeepAgentsCore, request: DeleteSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsDeleteSubagentToolRelation.d.ts.map