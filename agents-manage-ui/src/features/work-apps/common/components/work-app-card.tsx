'use client';

import { Layers, Settings, Zap } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkApp } from '../types';
import { WorkAppIcon } from './work-app-icon';

interface WorkAppCardProps {
  app: WorkApp;
  tenantId: string;
  onInstall?: () => void;
  workspaceCount?: number;
}

export function WorkAppCard({ app, tenantId, onInstall, workspaceCount = 0 }: WorkAppCardProps) {
  const getStatusBadge = () => {
    switch (app.status) {
      case 'connected':
        return (
          <Badge className="bg-green-600 hover:bg-green-700">
            <Zap className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case 'installed':
        return (
          <Badge
            variant="secondary"
            className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
          >
            Installed
          </Badge>
        );
      default:
        return <Badge variant="outline">Available</Badge>;
    }
  };

  const getActionButton = () => {
    if (app.status === 'connected' || app.status === 'installed') {
      return (
        <div className="space-y-2 w-full">
          {workspaceCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span>
                {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''} connected
              </span>
            </div>
          )}
          <Button variant="outline" asChild className="w-full">
            <Link href={`/${tenantId}/work-apps/${app.id}`}>
              <Settings className="h-4 w-4 mr-2" />
              Manage
            </Link>
          </Button>
        </div>
      );
    }

    return (
      <Button onClick={onInstall} className="w-full">
        Install {app.name}
      </Button>
    );
  };

  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-lg">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: app.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${app.color}15` }}>
              <WorkAppIcon appId={app.id} className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg">{app.name}</CardTitle>
              {getStatusBadge()}
            </div>
          </div>
        </div>
        <CardDescription className="mt-2">{app.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Features:</p>
          <ul className="text-xs space-y-1">
            {app.features.slice(0, 3).map((feature) => (
              <li key={feature} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary" />
                {feature}
              </li>
            ))}
            {app.features.length > 3 && (
              <li className="text-muted-foreground italic">& {app.features.length - 3} more</li>
            )}
          </ul>
        </div>
        {getActionButton()}
      </CardContent>
    </Card>
  );
}
