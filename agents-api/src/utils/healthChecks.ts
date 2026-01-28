import type { AgentsRunDatabaseClient } from '@inkeep/agents-core';
import type { Pool } from 'pg';

const HEALTH_CHECK_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Health check timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function checkManageDb(pool: Pool): Promise<boolean> {
  try {
    await withTimeout(pool.query('SELECT 1'), HEALTH_CHECK_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

export async function checkRunDb(client: AgentsRunDatabaseClient): Promise<boolean> {
  try {
    if ('$client' in client && client.$client) {
      const pool = client.$client as Pool;
      await withTimeout(pool.query('SELECT 1'), HEALTH_CHECK_TIMEOUT_MS);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
