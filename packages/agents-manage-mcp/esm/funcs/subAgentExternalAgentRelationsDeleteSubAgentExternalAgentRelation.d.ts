import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteSubAgentExternalAgentRelationRequest, DeleteSubAgentExternalAgentRelationResponse } from "../models/deletesubagentexternalagentrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsDeleteSubAgentExternalAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentExternalAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentExternalAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsDeleteSubAgentExternalAgentRelation.d.ts.map