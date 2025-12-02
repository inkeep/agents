import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteFullProjectRequest, type DeleteFullProjectResponse } from '../models/deletefullprojectop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Full Project
 *
 * @remarks
 * Delete a complete project and cascade to all related entities (Agents, Sub Agents, tools, relationships)
 */
export declare function fullProjectDeleteFullProject(client$: InkeepAgentsCore, request: DeleteFullProjectRequest, options?: RequestOptions): APIPromise<Result<DeleteFullProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullProjectDeleteFullProject.d.ts.map