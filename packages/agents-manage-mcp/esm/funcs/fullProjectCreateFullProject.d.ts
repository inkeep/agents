import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateFullProjectRequest, type CreateFullProjectResponse } from '../models/createfullprojectop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateFullProjectAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Full Project
 *
 * @remarks
 * Create a complete project with all Agents, Sub Agents, tools, and relationships from JSON definition
 */
export declare function fullProjectCreateFullProject(client$: InkeepAgentsCore, request: CreateFullProjectRequest, options?: RequestOptions): APIPromise<Result<CreateFullProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullProjectCreateFullProject.d.ts.map