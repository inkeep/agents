import { headers, contextConfig } from '@inkeep/agents-core';
import { z } from 'zod';

export const lv3l5skz8rddjqmagl939Headers = headers({
  schema: z.object({ "return-id": z.string().optional(), "x-api-key": z.string(), "jwt-authentication-token": z.string() }).strict(),
});
export const lv3l5skz8rddjqmagl939 = contextConfig({
  id: 'lv3l5skz8rddjqmagl939',
  headers: lv3l5skz8rddjqmagl939Headers,
});
