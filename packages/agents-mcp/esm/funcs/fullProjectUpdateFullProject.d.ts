import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateFullProjectRequest, type UpdateFullProjectResponse } from '../models/updatefullprojectop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum UpdateFullProjectAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Full Project
 *
 * @remarks
 * Update or create a complete project with all Agents, Sub Agents, tools, and relationships from JSON definition
 */
export declare function fullProjectUpdateFullProject(client$: InkeepAgentsCore, request: UpdateFullProjectRequest, options?: RequestOptions): APIPromise<Result<UpdateFullProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullProjectUpdateFullProject.d.ts.map