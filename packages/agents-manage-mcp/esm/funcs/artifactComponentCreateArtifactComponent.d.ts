import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { CreateArtifactComponentRequest, CreateArtifactComponentResponse } from "../models/createartifactcomponentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum CreateArtifactComponentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Artifact Component
 */
export declare function artifactComponentCreateArtifactComponent(client$: InkeepAgentsCore, request: CreateArtifactComponentRequest, options?: RequestOptions): APIPromise<Result<CreateArtifactComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=artifactComponentCreateArtifactComponent.d.ts.map