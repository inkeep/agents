'use client';

import { CheckIcon, Settings, Zap } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
          <Badge className="uppercase" variant="violet">
            <Zap className="h-3 w-3" />
            Connected
          </Badge>
        );
      case 'installed':
        return (
          <Badge className="uppercase" variant="primary">
            <CheckIcon className="h-3 w-3" />
            Installed
          </Badge>
        );
      default:
        return (
          <Badge className="uppercase" variant="code">
            Available
          </Badge>
        );
    }
  };

  const getActionButton = () => {
    if (app.status === 'connected' || app.status === 'installed') {
      return (
        <div className="w-full gap-3 flex items-center justify-between">
          {workspaceCount > 0 ? (
            <Badge variant="outline" className="font-mono uppercase">
              {workspaceCount}
              <span>workspace{workspaceCount !== 1 ? 's' : ''}</span>
            </Badge>
          ) : (
            <span />
          )}
          <Button variant="outline" asChild size="sm">
            <Link href={`/${tenantId}/work-apps/${app.id}`}>
              <Settings className="h-4 w-4" />
              Manage
            </Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end w-full">
        <Button size="sm" onClick={onInstall}>
          Install {app.name}
        </Button>
      </div>
    );
  };

  return (
    <Card className="relative overflow-hidden transition-all shadow-none justify-between">
      <CardHeader className="">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WorkAppIcon appId={app.id} className="h-6 w-6" />
            <CardTitle className="text-base text-foreground">{app.name}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription className="mt-2">{app.description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex items-center justify-between border-t">
        {getActionButton()}
      </CardFooter>
    </Card>
  );
}
