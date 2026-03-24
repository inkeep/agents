import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { v1 } from '@authzed/authzed-node';
import { getSpiceDbConfig } from './authz/config';

export async function writeSpiceDbSchema(options?: {
  endpoint?: string;
  token?: string;
  schemaPath?: string;
  maxRetries?: number;
}): Promise<void> {
  const config = getSpiceDbConfig();

  const {
    endpoint = config.endpoint,
    token = config.token,
    schemaPath = resolve(import.meta.dirname, '../../spicedb/schema.zed'),
    maxRetries = 30,
  } = options ?? {};

  const schema = readFileSync(schemaPath, 'utf-8');

  const client = v1.NewClient(
    token,
    endpoint,
    config.tlsEnabled ? v1.ClientSecurity.SECURE : v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
  );

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.promises.writeSchema(v1.WriteSchemaRequest.create({ schema }));
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(
    `Failed to write SpiceDB schema after ${maxRetries} attempts: ${lastError?.message}`
  );
}
