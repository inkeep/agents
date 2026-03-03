'use client';

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

export function AppsTable({ apps, agentLookup, agentOptions, canUse }: AppsTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Agent Access</TableHead>
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
                  <AgentAccessCell app={app} agentLookup={agentLookup} />
                </TableCell>
                <TableCell>
                  <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-sm font-mono">
                    app_{app.publicId}
                  </code>
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

function AgentAccessCell({ app, agentLookup }: { app: App; agentLookup: Record<string, Agent> }) {
  if (app.agentAccessMode === 'all') {
    return <span className="text-sm text-muted-foreground">All agents</span>;
  }

  if (app.allowedAgentIds.length === 0) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  const names = app.allowedAgentIds.slice(0, 3).map((id) => agentLookup[id]?.name ?? id);

  const remaining = app.allowedAgentIds.length - 3;

  return (
    <span className="text-sm text-muted-foreground">
      {names.join(', ')}
      {remaining > 0 && ` +${remaining}`}
    </span>
  );
}
