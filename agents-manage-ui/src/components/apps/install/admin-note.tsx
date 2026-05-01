'use client';

import {
  DEFAULT_MEMBERSHIP_LIMIT,
  OrgRoles,
  ProjectRoles,
} from '@inkeep/agents-core/client-exports';
import { ArrowUpRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { useAuthClient } from '@/contexts/auth-client';
import { listProjectMembers } from '@/lib/api/project-members';

interface AdminNoteProps {
  tenantId: string;
  projectId: string;
  isZendesk: boolean;
  chromeExtensionId: string;
}

interface Counts {
  members: number;
  admins: number;
}

function describeAccess({ members, admins }: Counts): string {
  if (members === 0) {
    const adminLine = admins > 0 ? ` Org admins (${admins}) have access automatically.` : '';
    return `No project members yet.${adminLine} Add project members to give your team access.`;
  }
  return `Currently ${members} project member${members === 1 ? '' : 's'} and ${admins} org admin${admins === 1 ? '' : 's'} have access.`;
}

export function AdminNote({ tenantId, projectId, isZendesk, chromeExtensionId }: AdminNoteProps) {
  const authClient = useAuthClient();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listProjectMembers({ tenantId, projectId }),
      authClient.organization.getFullOrganization({
        query: { organizationId: tenantId, membersLimit: DEFAULT_MEMBERSHIP_LIMIT },
      }),
    ])
      .then(([proj, org]) => {
        if (cancelled) return;
        const members = proj.data.filter(
          (m) => m.role === ProjectRoles.ADMIN || m.role === ProjectRoles.MEMBER
        ).length;
        const admins =
          org.data?.members?.filter((m) => m.role === OrgRoles.OWNER || m.role === OrgRoles.ADMIN)
            .length ?? 0;
        setCounts({ members, admins });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('AdminNote: failed to load member/admin counts', err);
          setErrored(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, authClient]);

  const showCounts = counts !== null && !errored;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin note
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Only users added to this project (Project Member role or above) can use the Support
          Copilot app.
        </p>

        {showCounts && <p className="text-sm text-muted-foreground">{describeAccess(counts)}</p>}

        <Link
          href={`/${tenantId}/projects/${projectId}/members`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Review project members
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </div>

      {!isZendesk && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Chrome extension ID (for enterprise allowlist / force-install policies)
          </p>
          <CopyableSingleLineCode code={chromeExtensionId} />
        </div>
      )}
    </div>
  );
}
