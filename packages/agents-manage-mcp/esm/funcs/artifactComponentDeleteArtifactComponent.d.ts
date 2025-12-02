import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteArtifactComponentRequest, type DeleteArtifactComponentResponse } from '../models/deleteartifactcomponentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Artifact Component
 */
export declare function artifactComponentDeleteArtifactComponent(client$: InkeepAgentsCore, request: DeleteArtifactComponentRequest, options?: RequestOptions): APIPromise<Result<DeleteArtifactComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=artifactComponentDeleteArtifactComponent.d.ts.map