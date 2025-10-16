'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function MCPServerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <FullPageError
      error={error}
      reset={reset}
      link={`/${tenantId}/projects/${projectId}/mcp-servers`}
      linkText="Back to MCP servers"
      context="MCP server"
    />
  );
}
