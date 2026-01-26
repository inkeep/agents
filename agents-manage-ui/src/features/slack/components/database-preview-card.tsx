'use client';

import { Copy, Database, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDatabaseState } from '../hooks/use-local-db';

export function DatabasePreviewCard() {
  const { state, refresh, exportJSON, importJSON, clearAll } = useDatabaseState();
  const [activeTab, setActiveTab] = useState('workspaces');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const json = exportJSON();
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [exportJSON]);

  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkeep-slack-db-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportJSON]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        importJSON(text);
      }
    };
    input.click();
  }, [importJSON]);

  const stats = useMemo(() => {
    if (!state)
      return { workspaces: 0, users: 0, slackConnections: 0, connections: 0, auditLogs: 0 };
    return {
      workspaces: state.workspaces.length,
      users: state.users.length,
      slackConnections: state.slackUserConnections?.length || 0,
      connections: state.connections.length,
      auditLogs: state.auditLogs.length,
    };
  }, [state]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  }, []);

  if (!state) {
    return (
      <Card className="mt-6">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading database state...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <div>
              <CardTitle>Local Database Preview</CardTitle>
              <CardDescription>
                PostgreSQL-like schema stored in localStorage (v{state.version})
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-1" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button variant="destructive" size="sm" onClick={clearAll}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary">Workspaces: {stats.workspaces}</Badge>
          <Badge variant="secondary">Users: {stats.users}</Badge>
          <Badge variant="secondary">Slack Connections: {stats.slackConnections}</Badge>
          <Badge variant="secondary">Audit Logs: {stats.auditLogs}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="slack">Slack</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="json">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="workspaces" className="mt-4">
            {state.workspaces.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No workspaces</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">ID</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">External ID</th>
                      <th className="text-left py-2 px-2">Installed By</th>
                      <th className="text-left py-2 px-2">Installed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.workspaces.map((w) => (
                      <tr key={w.id} className="border-b">
                        <td className="py-2 px-2 font-mono text-xs">{w.id.slice(0, 8)}...</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline">{w.integrationType}</Badge>
                        </td>
                        <td className="py-2 px-2 font-medium">{w.name}</td>
                        <td className="py-2 px-2 font-mono text-xs">{w.externalId}</td>
                        <td className="py-2 px-2">
                          {w.installedByUserEmail || w.installedByUserId}
                        </td>
                        <td className="py-2 px-2 text-xs">{formatDate(w.installedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            {state.users.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No users</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">ID</th>
                      <th className="text-left py-2 px-2">Email</th>
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Role</th>
                      <th className="text-left py-2 px-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.users.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="py-2 px-2 font-mono text-xs">{u.id.slice(0, 12)}...</td>
                        <td className="py-2 px-2">{u.email}</td>
                        <td className="py-2 px-2">{u.name || '—'}</td>
                        <td className="py-2 px-2">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-xs">{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="slack" className="mt-4">
            {(state.slackUserConnections?.length || 0) === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No Slack user connections
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">ID</th>
                      <th className="text-left py-2 px-2">Inkeep User</th>
                      <th className="text-left py-2 px-2">Slack Workspace</th>
                      <th className="text-left py-2 px-2">Nango</th>
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Connected At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.slackUserConnections?.map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 px-2 font-mono text-xs">{c.id.slice(0, 8)}...</td>
                        <td className="py-2 px-2">
                          <div className="text-xs">
                            <div className="font-medium">
                              {c.inkeepUserEmail || c.inkeepUserName}
                            </div>
                            <div className="text-muted-foreground font-mono">
                              {c.inkeepUserId.slice(0, 12)}...
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">{c.slackWorkspaceId}</td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {c.nangoConnectionId.slice(0, 8)}...
                        </td>
                        <td className="py-2 px-2">
                          <Badge
                            variant={c.status === 'active' ? 'default' : 'secondary'}
                            className={c.status === 'active' ? 'bg-green-600' : ''}
                          >
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-xs">{formatDate(c.connectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            {state.auditLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No audit logs</p>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Action</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Resource</th>
                      <th className="text-left py-2 px-2">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.auditLogs.slice(0, 20).map((l) => (
                      <tr key={l.id} className="border-b">
                        <td className="py-2 px-2 text-xs">{formatDate(l.createdAt)}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline">{l.action}</Badge>
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="secondary">{l.integrationType}</Badge>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {l.resourceId.slice(0, 12)}...
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {l.userId?.slice(0, 8) || '—'}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
              {JSON.stringify(state, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          Last updated: {formatDate(state.lastUpdatedAt)}
        </div>
      </CardContent>
    </Card>
  );
}
