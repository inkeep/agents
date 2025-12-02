import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetArtifactComponentsForAgentRequest, type GetArtifactComponentsForAgentResponse } from '../models/getartifactcomponentsforagentop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum GetArtifactComponentsForAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Artifact Components for Agent
 */
export declare function agentArtifactComponentRelationsGetArtifactComponentsForAgent(client$: InkeepAgentsCore, request: GetArtifactComponentsForAgentRequest, options?: RequestOptions): APIPromise<Result<GetArtifactComponentsForAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsGetArtifactComponentsForAgent.d.ts.map