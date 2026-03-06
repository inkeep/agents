'use server';

import { cookies } from 'next/headers';

import { resolveServerAgentsApiUrl } from '../runtime-config/environment';

type ActionResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

interface CopilotTokenResponse {
  apiKey: string;
  expiresAt: string;
  cookieHeader?: string;
}

export async function getCopilotTokenAction(): Promise<ActionResult<CopilotTokenResponse>> {
  const copilotTenantId = process.env.PUBLIC_INKEEP_COPILOT_TENANT_ID;
  const copilotProjectId = process.env.PUBLIC_INKEEP_COPILOT_PROJECT_ID;
  const copilotAgentId = process.env.PUBLIC_INKEEP_COPILOT_AGENT_ID;
  const agentsApiUrl = resolveServerAgentsApiUrl();

  if (!copilotTenantId || !copilotProjectId || !copilotAgentId) {
    return {
      success: false,
      error: 'Copilot tenant, project, or agent ID is not configured',
      code: 'configuration_error',
    };
  }

  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    if (!cookieHeader) {
      return {
        success: false,
        error: 'No active session — please log in',
        code: 'auth_error',
      };
    }

    const response = await fetch(
      `${agentsApiUrl}/manage/tenants/${copilotTenantId}/playground/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-cookie': cookieHeader,
        },
        body: JSON.stringify({
          projectId: copilotProjectId,
          agentId: copilotAgentId,
        }),
      }
    );

    if (!response.ok) {
      let errorMessage = 'Failed to fetch copilot token';
      try {
        const errorData = await response.json();
        errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      return {
        success: false,
        error: errorMessage,
        code: 'api_error',
      };
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        apiKey: data.apiKey,
        expiresAt: data.expiresAt,
        cookieHeader: cookieHeader || undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'network_error',
    };
  }
}
