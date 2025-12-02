import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type AssociateArtifactComponentWithAgentRequest, type AssociateArtifactComponentWithAgentResponse } from '../models/associateartifactcomponentwithagentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum AssociateArtifactComponentWithAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Associate Artifact Component with Agent
 */
export declare function agentArtifactComponentRelationsAssociateArtifactComponentWithAgent(client$: InkeepAgentsCore, request: AssociateArtifactComponentWithAgentRequest, options?: RequestOptions): APIPromise<Result<AssociateArtifactComponentWithAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsAssociateArtifactComponentWithAgent.d.ts.map