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
import type { Graph } from '@/lib/types/graph-full';
import { ApiKeyItemMenu } from './api-key-item-menu';
import { ExpirationIndicator } from './expiration-indicator';

interface ApiKeysTableProps {
  apiKeys: ApiKey[];
  graphLookup: Record<string, Graph>;
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
            apiKeys.map(({ id, name, graphId, keyPrefix, lastUsedAt, expiresAt, createdAt }) => (
              <TableRow key={id} noHover>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{name || 'No name'}</span>
                    <span className="text-sm text-muted-foreground">
                      {graphLookup[graphId]?.name || graphId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
                    {keyPrefix}
                    {'•'.repeat(3)}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lastUsedAt ? formatDateAgo(lastUsedAt) : 'Never'}
                </TableCell>
                <TableCell>
                  <ExpirationIndicator expiresAt={expiresAt} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {createdAt ? formatDateAgo(createdAt) : ''}
                </TableCell>
                <TableCell>
                  <ApiKeyItemMenu apiKeyId={id} apiKeyName={name} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
