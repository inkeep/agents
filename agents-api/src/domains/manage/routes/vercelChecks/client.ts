import { z } from 'zod';

const VERCEL_API_BASE_URL = 'https://api.vercel.com';

export const CreateCheckRequestSchema = z.object({
  name: z.string().describe('The name of the check'),
  blocking: z.boolean().describe('Whether the check blocks deployment'),
  rerequestable: z.boolean().optional().describe('Whether the check can be re-requested'),
  detailsUrl: z.string().optional().describe('URL for check details'),
});

export type CreateCheckRequest = z.infer<typeof CreateCheckRequestSchema>;

export const CheckResponseSchema = z.object({
  id: z.string().describe('Unique check ID'),
  name: z.string().describe('The name of the check'),
  status: z
    .enum(['registered', 'running', 'completed'])
    .describe('Current status of the check'),
  blocking: z.boolean().describe('Whether the check blocks deployment'),
  integrationId: z.string().describe('Integration ID that created the check'),
  deploymentId: z.string().describe('Associated deployment ID'),
  createdAt: z.number().describe('Unix timestamp when the check was created'),
  updatedAt: z.number().describe('Unix timestamp when the check was last updated'),
  rerequestable: z.boolean().optional().describe('Whether the check can be re-requested'),
  conclusion: z
    .enum(['canceled', 'failed', 'neutral', 'succeeded', 'skipped', 'stale'])
    .nullable()
    .optional()
    .describe('Final conclusion of the check'),
  detailsUrl: z.string().optional().describe('URL for check details'),
});

export type CheckResponse = z.infer<typeof CheckResponseSchema>;

export const UpdateCheckRequestSchema = z.object({
  status: z
    .enum(['running', 'completed'])
    .optional()
    .describe('Updated status of the check'),
  conclusion: z
    .enum(['canceled', 'failed', 'neutral', 'succeeded', 'skipped'])
    .optional()
    .describe('Final conclusion of the check'),
  detailsUrl: z.string().optional().describe('URL for check details'),
});

export type UpdateCheckRequest = z.infer<typeof UpdateCheckRequestSchema>;

export interface VercelChecksClientConfig {
  token: string;
  teamId?: string;
}

export class VercelApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

function buildUrl(
  path: string,
  teamId?: string
): string {
  const url = new URL(path, VERCEL_API_BASE_URL);
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }
  return url.toString();
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Vercel API error: ${response.status}`;
    let errorCode: string | undefined;

    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
      if (errorJson.error?.code) {
        errorCode = errorJson.error.code;
      }
    } catch {
      if (errorBody) {
        errorMessage = errorBody;
      }
    }

    throw new VercelApiError(errorMessage, response.status, errorCode);
  }

  return response.json();
}

/**
 * Creates a new blocking check for a deployment.
 *
 * @param deploymentId - The deployment ID to register the check for
 * @param request - The check configuration
 * @param config - Client configuration with token and optional teamId
 * @returns The created check
 */
export async function createCheck(
  deploymentId: string,
  request: CreateCheckRequest,
  config: VercelChecksClientConfig
): Promise<CheckResponse> {
  const url = buildUrl(`/v1/deployments/${deploymentId}/checks`, config.teamId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return handleResponse<CheckResponse>(response);
}

/**
 * Updates an existing check with a new status or conclusion.
 *
 * @param deploymentId - The deployment ID the check belongs to
 * @param checkId - The check ID to update
 * @param request - The update data
 * @param config - Client configuration with token and optional teamId
 * @returns The updated check
 */
export async function updateCheck(
  deploymentId: string,
  checkId: string,
  request: UpdateCheckRequest,
  config: VercelChecksClientConfig
): Promise<CheckResponse> {
  const url = buildUrl(`/v1/deployments/${deploymentId}/checks/${checkId}`, config.teamId);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return handleResponse<CheckResponse>(response);
}
