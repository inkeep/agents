import * as z from 'zod';
export type Formatted = {
    llmContext: string;
};
export declare const Formatted$zodSchema: z.ZodType<Formatted, z.ZodTypeDef, unknown>;
export type ConversationWithFormattedMessagesResponseData = {
    messages: Array<any | null>;
    formatted: Formatted;
};
export declare const ConversationWithFormattedMessagesResponseData$zodSchema: z.ZodType<ConversationWithFormattedMessagesResponseData, z.ZodTypeDef, unknown>;
export type ConversationWithFormattedMessagesResponse = {
    data: ConversationWithFormattedMessagesResponseData;
};
export declare const ConversationWithFormattedMessagesResponse$zodSchema: z.ZodType<ConversationWithFormattedMessagesResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=conversationwithformattedmessagesresponse.d.ts.map