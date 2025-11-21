import * as z from 'zod';
import { BadRequest } from './badrequest.js';
import { ConversationWithFormattedMessagesResponse } from './conversationwithformattedmessagesresponse.js';
import { Forbidden } from './forbidden.js';
import { InternalServerError } from './internalservererror.js';
import { NotFound } from './notfound.js';
import { Unauthorized } from './unauthorized.js';
import { UnprocessableEntity } from './unprocessableentity.js';
export type GetConversationRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    limit?: number | undefined;
    includeInternal?: boolean | null | undefined;
};
export declare const GetConversationRequest$zodSchema: z.ZodType<GetConversationRequest, z.ZodTypeDef, unknown>;
export type GetConversationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ConversationWithFormattedMessagesResponse?: ConversationWithFormattedMessagesResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetConversationResponse$zodSchema: z.ZodType<GetConversationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getconversationop.d.ts.map