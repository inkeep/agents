import { Lock } from 'lucide-react';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { fetchCredential } from '@/lib/api/credentials';

async function ResolvedCredentialBadge({
  tenantId,
  projectId,
  credentialReferenceId,
}: CredentialNameBadgeProps) {
  const credential = await fetchCredential(tenantId, projectId, credentialReferenceId).catch(
    () => null
  );
  return (
    <Badge variant="code" className="flex items-center gap-2">
      <Lock className="w-4 h-4" />
      {credential?.name || credentialReferenceId}
    </Badge>
  );
}

export function CredentialBadgeFallback({
  credentialReferenceId,
}: {
  credentialReferenceId: string;
}) {
  return (
    <Badge variant="code" className="flex items-center gap-2">
      <Lock className="w-4 h-4" />
      {credentialReferenceId}
    </Badge>
  );
}

interface CredentialNameBadgeProps {
  tenantId: string;
  projectId: string;
  credentialReferenceId: string;
}

export function CredentialNameBadge(props: CredentialNameBadgeProps) {
  return (
    <Suspense
      fallback={<CredentialBadgeFallback credentialReferenceId={props.credentialReferenceId} />}
    >
      <ResolvedCredentialBadge {...props} />
    </Suspense>
  );
}
