import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteArtifactComponentRequest, DeleteArtifactComponentResponse } from "../models/deleteartifactcomponentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Artifact Component
 */
export declare function artifactComponentDeleteArtifactComponent(client$: InkeepAgentsCore, request: DeleteArtifactComponentRequest, options?: RequestOptions): APIPromise<Result<DeleteArtifactComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=artifactComponentDeleteArtifactComponent.d.ts.map