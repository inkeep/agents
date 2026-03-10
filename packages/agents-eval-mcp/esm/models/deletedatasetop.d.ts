import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteDatasetRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
};
export declare const DeleteDatasetRequest$zodSchema: z.ZodType<
  DeleteDatasetRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteDatasetResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
  BadRequest?: BadRequest | undefined;
  Unauthorized?: Unauthorized | undefined;
  Forbidden?: Forbidden | undefined;
  NotFound?: NotFound | undefined;
  UnprocessableEntity?: UnprocessableEntity | undefined;
  InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteDatasetResponse$zodSchema: z.ZodType<
  DeleteDatasetResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deletedatasetop.d.ts.map
