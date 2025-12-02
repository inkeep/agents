import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteSubagentToolRelationRequest, type DeleteSubagentToolRelationResponse } from '../models/deletesubagenttoolrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete SubAgent Tool Relation
 */
export declare function subAgentToolRelationsDeleteSubagentToolRelation(client$: InkeepAgentsCore, request: DeleteSubagentToolRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubagentToolRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentToolRelationsDeleteSubagentToolRelation.d.ts.map