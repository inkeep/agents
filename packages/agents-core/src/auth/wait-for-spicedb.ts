import { v1 } from '@authzed/authzed-node';
import { getSpiceDbConfig } from './authz/config';

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_INTERVAL_MS = 2000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isSchemaMissingError(message: string): boolean {
  return /no schema has been defined/i.test(message);
}

function isPermanentConfigurationError(message: string): boolean {
  return /(permission denied|unauthenticated|invalid token|authentication failed|tls|ssl)/i.test(
    message
  );
}

async function main() {
  const config = getSpiceDbConfig();
  const maxAttempts = parsePositiveInt(
    process.env.SPICEDB_READY_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  const intervalMs = parsePositiveInt(process.env.SPICEDB_READY_INTERVAL_MS, DEFAULT_INTERVAL_MS);

  const client = v1.NewClient(
    config.token,
    config.endpoint,
    config.tlsEnabled ? v1.ClientSecurity.SECURE : v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
  );

  console.log(
    `Waiting for SpiceDB schema API at ${config.endpoint} (${config.tlsEnabled ? 'tls' : 'plaintext'})`
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.promises.readSchema(v1.ReadSchemaRequest.create({}));
      console.log(`SpiceDB schema API ready after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      const message = getErrorMessage(error);

      if (isSchemaMissingError(message)) {
        console.log(`SpiceDB schema API reachable after ${attempt} attempt(s).`);
        return;
      }

      if (isPermanentConfigurationError(message)) {
        throw new Error(`SpiceDB readiness failed due to configuration error: ${message}`, {
          cause: error,
        });
      }

      if (attempt === maxAttempts) {
        throw new Error(
          `SpiceDB schema API was not reachable after ${maxAttempts} attempts: ${message}`,
          {
            cause: error,
          }
        );
      }

      console.log(`SpiceDB not ready yet (attempt ${attempt}/${maxAttempts}): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
