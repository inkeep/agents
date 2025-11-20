import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CheckArtifactComponentAgentAssociationRequest, CheckArtifactComponentAgentAssociationResponse } from "../models/checkartifactcomponentagentassociationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CheckArtifactComponentAgentAssociationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Check if Artifact Component is Associated with Agent
 */
export declare function agentArtifactComponentRelationsCheckArtifactComponentAgentAssociation(client$: InkeepAgentsCore, request: CheckArtifactComponentAgentAssociationRequest, options?: RequestOptions): APIPromise<Result<CheckArtifactComponentAgentAssociationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsCheckArtifactComponentAgentAssociation.d.ts.map