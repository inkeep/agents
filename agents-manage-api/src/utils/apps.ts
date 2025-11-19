import { OpenAPIHono } from '@hono/zod-openapi';
import type { DatabaseClient } from '@inkeep/agents-core';

export const createAppWithDb = (): OpenAPIHono<{ Variables: { db: DatabaseClient } }> => {
  return new OpenAPIHono<{ Variables: { db: DatabaseClient } }>();
};