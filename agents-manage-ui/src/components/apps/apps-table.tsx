'use client';

import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { SelectOption } from '@/components/form/generic-select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { App } from '@/lib/api/apps';
import type { Agent } from '@/lib/types/agent-full';
import { formatDateAgo } from '@/lib/utils/format-date';
import { AppItemMenu } from './app-item-menu';

interface AppsTableProps {
  apps: App[];
  agentLookup: Record<string, Agent>;
  agentOptions: SelectOption[];
  canUse: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  web_client: 'Web Client',
  api: 'API',
};

const TYPE_BADGE_VARIANT: Record<string, 'sky' | 'violet'> = {
  web_client: 'sky',
  api: 'violet',
};

function AppIdCell({ appId }: { appId: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({});
  return (
    <button
      type="button"
      onClick={() => copyToClipboard(appId)}
      aria-label={isCopied ? 'Copied App ID' : 'Copy App ID to clipboard'}
      className="group/appid relative cursor-pointer bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono overflow-hidden"
    >
      {appId}
      <span className="absolute inset-y-0 right-0 flex items-center px-2 bg-gradient-to-l from-muted from-70% to-muted/0 opacity-0 group-hover/appid:opacity-100 transition-opacity">
        {isCopied ? (
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </span>
    </button>
  );
}

export function AppsTable({ apps, agentLookup, agentOptions, canUse }: AppsTableProps) {
  const { tenantId } = useParams<{ tenantId: string }>();
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Default Agent</TableHead>
            <TableHead>App ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No apps yet.
              </TableCell>
            </TableRow>
          ) : (
            apps.map((app) => (
              <TableRow key={app.id} noHover>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{app.name}</span>
                    {app.description && (
                      <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {app.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={TYPE_BADGE_VARIANT[app.type] ?? 'secondary'}>
                    {TYPE_LABELS[app.type] ?? app.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {app.defaultAgentId && app.defaultProjectId ? (
                    <Link
                      href={`/${tenantId}/projects/${app.defaultProjectId}/agents/${app.defaultAgentId}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                    >
                      {agentLookup[app.defaultAgentId]?.name ?? app.defaultAgentId}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <AppIdCell appId={app.id} />
                </TableCell>
                <TableCell>
                  <Badge variant={app.enabled ? 'success' : 'warning'}>
                    {app.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {app.createdAt ? formatDateAgo(app.createdAt) : ''}
                </TableCell>
                <TableCell>
                  {canUse && <AppItemMenu app={app} agentOptions={agentOptions} />}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
