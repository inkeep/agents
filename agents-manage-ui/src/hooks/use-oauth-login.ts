import {
  CredentialStoreType,
  DEFAULT_NANGO_STORE_ID,
  generateIdFromName,
} from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type {
  OAuthLoginHandler,
  OAuthLoginParams,
} from '@/components/agent/copilot/components/connect-tool-card';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { listCredentialStores } from '@/lib/api/credentialStores';
import { updateMCPTool } from '@/lib/api/tools';
import { toast } from '@/lib/toast';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { generateId } from '@/lib/utils/id-utils';
import { getOAuthLoginUrl } from '@/lib/utils/mcp-urls';
import { useAuthSession } from './use-auth';
import { useNangoConnect } from './use-nango-connect';

interface UseOAuthLoginProps {
  tenantId: string;
  projectId: string;
  onFinish?: (toolId: string) => void;
}

interface OAuthLoginResult {
  handleOAuthLogin: OAuthLoginHandler;
}

export function useOAuthLogin({
  tenantId,
  projectId,
  onFinish,
}: UseOAuthLoginProps): OAuthLoginResult {
  const router = useRouter();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { openNangoConnectHeadless } = useNangoConnect();
  const { user } = useAuthSession();

  // Track active OAuth attempts to prevent conflicts
  const activeAttemptsRef = useRef(new Map<string, () => void>());

  const handleOAuthLoginManually = useCallback(
    (toolId: string, thirdPartyConnectAccountUrl?: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Clean up any previous attempt for this toolId
        const existingCleanup = activeAttemptsRef.current.get(toolId);
        if (existingCleanup) {
          existingCleanup();
          activeAttemptsRef.current.delete(toolId);
        }

        try {
          const oauthUrl =
            thirdPartyConnectAccountUrl ??
            getOAuthLoginUrl({
              PUBLIC_INKEEP_AGENTS_API_URL,
              tenantId,
              projectId,
              id: toolId,
            });

          const popup = window.open(
            oauthUrl,
            'oauth-popup',
            'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes'
          );

          if (!popup) {
            const error = new Error(`Failed to open popup for ${toolId} - blocked by browser`);
            console.error(error.message);
            reject(error);
            return;
          }

          // Track completion to prevent duplicate calls
          let completed = false;

          const completeFlow = (success: boolean, error?: Error) => {
            if (completed) return;
            completed = true;

            // Cleanup
            window.removeEventListener('message', handleMessage);
            if (checkPopupClosed) clearInterval(checkPopupClosed);
            clearTimeout(backupTimeout);
            activeAttemptsRef.current.delete(toolId);

            if (success) {
              // Call custom success handler or default behavior
              if (onFinish) {
                onFinish(toolId);
              } else {
                router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
              }
              resolve();
            } else {
              reject(error || new Error('OAuth login failed'));
            }
          };

          // Listen for success PostMessage
          const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'oauth-success') {
              completeFlow(true);
            } else if (event.data.type === 'oauth-error') {
              completeFlow(false, new Error(event.data.error || 'OAuth login failed'));
            }
          };

          window.addEventListener('message', handleMessage);

          // Backup: Monitor popup closure (for errors or PostMessage failures)
          let checkPopupClosed: NodeJS.Timeout | null = null;
          const backupTimeout = setTimeout(() => {
            if (!completed) {
              checkPopupClosed = setInterval(() => {
                try {
                  if (popup.closed) {
                    // Assume success if popup closed without error message
                    completeFlow(true);
                  }
                } catch {
                  // Cross-origin errors are expected during OAuth redirects
                }
              }, 1000);
            }
          }, 3000);

          // Register cleanup function for this attempt
          const cleanup = () => {
            completeFlow(false, new Error('OAuth login cancelled'));
          };
          activeAttemptsRef.current.set(toolId, cleanup);
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error('OAuth login failed');
          reject(errorObj);
        }
      });
    },
    [PUBLIC_INKEEP_AGENTS_API_URL, tenantId, projectId, onFinish, router]
  );

  const handleOAuthLoginWithNangoMCPGeneric = useCallback(
    async ({
      toolId,
      mcpServerUrl,
      toolName,
      credentialScope,
    }: {
      toolId: string;
      mcpServerUrl: string;
      toolName: string;
      credentialScope?: 'project' | 'user';
    }): Promise<void> => {
      const authResult = await openNangoConnectHeadless({
        mcpServerUrl,
        providerUniqueKey: `${generateIdFromName(toolName)}_${toolId.slice(0, 4)}`,
        providerDisplayName: toolName,
      });

      const isUserScoped = credentialScope === 'user';

      let userId: string | undefined;
      if (isUserScoped) {
        if (!user) {
          throw new Error('User not found');
        }
        userId = user.id;
      }

      const newCredentialData = {
        id: generateId(),
        name: toolName,
        type: CredentialStoreType.nango,
        credentialStoreId: DEFAULT_NANGO_STORE_ID,
        createdBy: user?.email ?? undefined,
        // For user-scoped: set toolId and userId on the credential reference
        ...(isUserScoped && {
          toolId,
          userId,
        }),
        retrievalParams: {
          connectionId: authResult.connectionId,
          providerConfigKey: authResult.providerConfigKey,
          provider: 'mcp-generic',
          authMode: 'OAUTH2',
        },
      };

      const newCredential = await findOrCreateCredential(tenantId, projectId, newCredentialData);

      // For project-scoped: update the tool's credentialReferenceId
      // For user-scoped: don't update the tool (credential is linked via toolId + userId)
      if (!isUserScoped) {
        await updateMCPTool(tenantId, projectId, toolId, {
          credentialReferenceId: newCredential.id,
        });
      }

      // Call custom success handler or default behavior
      if (onFinish) {
        onFinish(toolId);
      } else {
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
      }
    },
    [openNangoConnectHeadless, onFinish, router, tenantId, projectId, user]
  );

  const handleOAuthLogin = useCallback(
    async ({
      toolId,
      mcpServerUrl,
      toolName,
      thirdPartyConnectAccountUrl,
      credentialScope,
    }: OAuthLoginParams): Promise<void> => {
      if (thirdPartyConnectAccountUrl) {
        await handleOAuthLoginManually(toolId, thirdPartyConnectAccountUrl);
        return;
      }

      try {
        // Check credential stores availability
        const credentialStoresStatus = await listCredentialStores(tenantId, projectId);

        const isNangoReady = credentialStoresStatus.some(
          (store) => store.type === CredentialStoreType.nango && store.available
        );

        const isKeychainReady = credentialStoresStatus.some(
          (store) => store.type === CredentialStoreType.keychain && store.available
        );

        // Choose authentication method based on availability
        if (isNangoReady) {
          await handleOAuthLoginWithNangoMCPGeneric({
            toolId,
            mcpServerUrl,
            toolName,
            credentialScope,
          });
        } else if (isKeychainReady) {
          await handleOAuthLoginManually(toolId);
        } else {
          throw new Error('No credential store available. Please configure Nango or Keychain.');
        }
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error('OAuth login failed');
        toast.error(errorObj.message);
        throw errorObj;
      }
    },
    [tenantId, projectId, handleOAuthLoginWithNangoMCPGeneric, handleOAuthLoginManually]
  );

  return {
    handleOAuthLogin,
  };
}
