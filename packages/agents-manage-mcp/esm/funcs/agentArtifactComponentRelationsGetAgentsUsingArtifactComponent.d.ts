import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetAgentsUsingArtifactComponentRequest, type GetAgentsUsingArtifactComponentResponse } from '../models/getagentsusingartifactcomponentop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetAgentsUsingArtifactComponentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Agents Using Artifact Component
 */
export declare function agentArtifactComponentRelationsGetAgentsUsingArtifactComponent(client$: InkeepAgentsCore, request: GetAgentsUsingArtifactComponentRequest, options?: RequestOptions): APIPromise<Result<GetAgentsUsingArtifactComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsGetAgentsUsingArtifactComponent.d.ts.map