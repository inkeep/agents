'use client';

import { Lock, LockOpen, Pencil } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from '@/components/ui/external-link';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { cn, normalizeDateString } from '@/lib/utils';
import { Button } from '../ui/button';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';

export function ViewExternalAgentDetails({
  externalAgent,
  tenantId,
  projectId,
}: {
  externalAgent: ExternalAgent;
  tenantId: string;
  projectId: string;
}) {
  const formatDate = (dateString: string) => {
    const normalized = normalizeDateString(dateString);
    return new Date(normalized).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const ItemLabel = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    return <div className={cn('text-sm font-medium leading-none', className)}>{children}</div>;
  };

  const ItemValue = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    return <div className={cn('flex w-full text-sm', className)}>{children}</div>;
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-medium tracking-tight">{externalAgent.name}</h2>
            <p className="text-sm text-muted-foreground">External agent details</p>
          </div>
        </div>
        <Button asChild>
          <Link
            href={`/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}/edit`}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Basic Information */}
      <div className="space-y-8">
        {/* Description */}
        {externalAgent.description && (
          <div className="space-y-2">
            <ItemLabel>Description</ItemLabel>
            <ItemValue>
              <p className="text-sm text-muted-foreground">{externalAgent.description}</p>
            </ItemValue>
          </div>
        )}

        {/* Created and Updated */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Created At</ItemLabel>
            <ItemValue>{formatDate(externalAgent.createdAt)}</ItemValue>
          </div>
          <div className="space-y-2">
            <ItemLabel>Updated At</ItemLabel>
            <ItemValue>{formatDate(externalAgent.updatedAt)}</ItemValue>
          </div>
        </div>

        {/* Base URL */}
        <div className="space-y-2">
          <ItemLabel>Base URL</ItemLabel>
          <CopyableSingleLineCode code={externalAgent.baseUrl} />
        </div>

        {/* Credential */}
        <div className="space-y-2">
          <ItemLabel>Credential</ItemLabel>
          <ItemValue className="items-center">
            {externalAgent.credentialReferenceId ? (
              <div className="flex items-center gap-2">
                <Badge variant="code" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {externalAgent.credentialReferenceId}
                </Badge>
                <ExternalLink
                  href={`/${tenantId}/projects/${projectId}/credentials/${externalAgent.credentialReferenceId}`}
                  className="text-xs"
                >
                  view credential
                </ExternalLink>
              </div>
            ) : (
              <Badge variant="warning" className="flex items-center gap-2">
                <LockOpen className="w-4 h-4" />
                Unsecured
              </Badge>
            )}
          </ItemValue>
        </div>
      </div>
    </div>
  );
}
