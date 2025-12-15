import { createApiKey, type AgentsRunDatabaseClient, generateApiKey } from '@inkeep/agents-core';

export interface CreateTempApiKeyParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  userId: string;
  expiryHours?: number;
}

export interface TempApiKeyResult {
  apiKey: string;
  expiresAt: string;
}

export async function createTempApiKey(
  db: AgentsRunDatabaseClient,
  params: CreateTempApiKeyParams
): Promise<TempApiKeyResult> {
  const expiryHours = params.expiryHours || 1;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const keyData = await generateApiKey();

  await createApiKey(db)({
    id: keyData.id,
    publicId: keyData.publicId,
    keyHash: keyData.keyHash,
    keyPrefix: keyData.keyPrefix,
    name: `playground-temp-${params.userId}`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    apiKey: keyData.key,
    expiresAt: expiresAt.toISOString(),
  };
}
