import { CredentialStoreType } from '../types';

/**
 * Get a lookup key for a credential store from retrieval params
 * @param retrievalParams - The retrieval params for the credential store
 * @param credentialStoreType - The type of credential store
 * @returns A lookup key for the credential store, used to call <CredentialStore>.get()
 */
export function getCredentialStoreLookupKeyFromRetrievalParams({
  retrievalParams,
  credentialStoreType,
}: {
  retrievalParams: Record<string, unknown>;
  credentialStoreType: keyof typeof CredentialStoreType;
}): string | null {
  if (retrievalParams.key) {
    return retrievalParams.key as string;
  }

  if (credentialStoreType === CredentialStoreType.nango) {
    return JSON.stringify({
      connectionId: retrievalParams.connectionId,
      providerConfigKey: retrievalParams.providerConfigKey,
    });
  }

  return null;
}
