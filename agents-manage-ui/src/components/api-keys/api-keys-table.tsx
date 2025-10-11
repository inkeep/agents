import { formatDateAgo } from '@/app/utils/format-date';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiKey } from '@/lib/api/api-keys';
import type { Agent } from '@/lib/types/agent-full';
import { ApiKeyItemMenu } from './api-key-item-menu';
import { ExpirationIndicator } from './expiration-indicator';

interface ApiKeysTableProps {
  apiKeys: ApiKey[];
  graphLookup: Record<string, Agent>;
}

export function ApiKeysTable({ apiKeys, graphLookup }: ApiKeysTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No API keys yet.
              </TableCell>
            </TableRow>
          ) : (
            apiKeys.map((apiKey) => (
              <TableRow key={apiKey.id} noHover>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{apiKey.name || 'No name'}</span>
                    <span className="text-sm text-muted-foreground">
                      {graphLookup[apiKey.agentId]?.name || apiKey.agentId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
                    {apiKey.keyPrefix}
                    {'•'.repeat(3)}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {apiKey.lastUsedAt ? formatDateAgo(apiKey.lastUsedAt) : 'Never'}
                </TableCell>
                <TableCell>
                  <ExpirationIndicator expiresAt={apiKey.expiresAt} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {apiKey.createdAt ? formatDateAgo(apiKey.createdAt) : ''}
                </TableCell>
                <TableCell>
                  <ApiKeyItemMenu apiKey={apiKey} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
