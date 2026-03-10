import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type DeleteDatasetItemRequest = {
  tenantId: string;
  projectId: string;
  datasetId: string;
  itemId: string;
};
export declare const DeleteDatasetItemRequest$zodSchema: z.ZodType<
  DeleteDatasetItemRequest,
  z.ZodTypeDef,
  unknown
>;
export type DeleteDatasetItemResponse = {
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
export declare const DeleteDatasetItemResponse$zodSchema: z.ZodType<
  DeleteDatasetItemResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=deletedatasetitemop.d.ts.map
