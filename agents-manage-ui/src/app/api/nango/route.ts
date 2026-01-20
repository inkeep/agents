import axios from 'axios';
import { type NextRequest, NextResponse } from 'next/server';
import { getManageApiUrl } from '@/lib/api/api-config';
import { getLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const logger = getLogger('nango-config-check');

  try {
    // Extract tenantId from query params
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId') || 'default';

    // Forward cookies for authentication
    const cookieHeader = request.headers.get('cookie');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    // Forward to manage-api health endpoint
    const manageApiUrl = getManageApiUrl();
    const endpoint = `${manageApiUrl}/tenants/${tenantId}/nango/health`;

    logger.info({ endpoint }, 'Checking Nango configuration via manage-api');

    const response = await axios.get(endpoint, {
      headers,
      timeout: 5000,
      withCredentials: true,
    });

    logger.info({ status: response.status }, 'Nango health check successful');

    return NextResponse.json(response.data);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        code: axios.isAxiosError(error) ? error.code : undefined,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      },
      'Nango health check failed'
    );

    let errorMessage = 'Failed to check Nango configuration';
    const configured = false;

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Management API not reachable';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Authentication required';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
    }

    return NextResponse.json({
      status: 'connection_failed',
      configured,
      error: errorMessage,
    });
  }
}
