import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { getOAuthLoginUrl } from '@/lib/utils/mcp-urls';

interface UseOAuthLoginProps {
  tenantId: string;
  projectId: string;
  onFinish?: (toolId: string) => void;
  onError?: (error: Error) => void;
}

export function useOAuthLogin({ tenantId, projectId, onFinish, onError }: UseOAuthLoginProps) {
  const router = useRouter();
  const { INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  // Track active OAuth attempts to prevent conflicts
  const activeAttempts = new Map<string, () => void>();

  const handleOAuthLogin = (toolId: string) => {
    // Clean up any previous attempt for this toolId
    const existingCleanup = activeAttempts.get(toolId);
    if (existingCleanup) {
      existingCleanup();
      activeAttempts.delete(toolId);
    }
    try {
      // Get the OAuth URL and open in popup window
      const oauthUrl = getOAuthLoginUrl({
        INKEEP_AGENTS_MANAGE_API_URL,
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
        console.error(`Failed to open popup for ${toolId} - blocked by browser`);
        return;
      }

      // Track completion to prevent duplicate calls
      let completed = false;

      // Listen for success PostMessage
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && !completed) {
          completed = true;
          window.removeEventListener('message', handleMessage);

          // Call custom success handler or default behavior
          if (onFinish) {
            onFinish(toolId);
          } else {
            router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
          }
        }
      };

      if (popup) {
        window.addEventListener('message', handleMessage);

        // Backup: Monitor popup closure (for errors or PostMessage failures)
        // Delay backup monitoring to give PostMessage priority
        let checkPopupClosed: NodeJS.Timeout | null = null;
        const backupTimeout = setTimeout(() => {
          if (!completed) {
            checkPopupClosed = setInterval(() => {
              try {
                if (popup.closed && !completed) {
                  completed = true;
                  if (checkPopupClosed) clearInterval(checkPopupClosed);
                  window.removeEventListener('message', handleMessage);
                  activeAttempts.delete(toolId);

                  // Call custom success handler or default behavior
                  if (onFinish) {
                    onFinish(toolId);
                  } else {
                    router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
                  }
                }
              } catch {
                // Cross-origin errors are expected during OAuth redirects
              }
            }, 1000); // Check every second
          }
        }, 3000); // Wait 3 seconds before starting backup monitoring

        // Register cleanup function for this attempt
        const cleanup = () => {
          clearTimeout(backupTimeout);
          if (checkPopupClosed) clearInterval(checkPopupClosed);
          window.removeEventListener('message', handleMessage);
          completed = true;
        };
        activeAttempts.set(toolId, cleanup);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('OAuth login failed');

      if (onError) {
        onError(errorObj);
      } else {
        toast.error('OAuth login failed. Please try again.');
      }
    }
  };

  return { handleOAuthLogin };
}
