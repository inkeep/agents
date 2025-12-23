import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { policyDescription } from '@/constants/page-descriptions';
import { fetchPolicies } from '@/lib/api/policies';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { PolicyItem } from '@/components/policies/policy-item';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/app/utils/format-date';

export const dynamic = 'force-dynamic';

async function PoliciesPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/policies'>) {
  const { tenantId, projectId } = await params;

  try {
    const { data } = await fetchPolicies(tenantId, projectId);
    const content = data.length ? (
      <>
        <PageHeader
          title="Policies"
          description={policyDescription}
          action={
            <Button asChild>
              <Link
                href={`/${tenantId}/projects/${projectId}/policies/new`}
                className="flex items-center gap-2"
              >
                <Plus className="size-4" />
                New policy
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {data.map((policy) => (
            <PolicyItem key={policy.id} {...policy} tenantId={tenantId} projectId={projectId} />
          ))}
        </div>
        <Table
          style={{
            tableLayout: 'fixed',
            width: '100%',
          }}
        >
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length ? (
              data.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell>{policy.name}</TableCell>
                  <TableCell>{policy.id}</TableCell>
                  <TableCell>{policy.description}</TableCell>
                  <TableCell>{policy.content}</TableCell>
                  <TableCell>{JSON.stringify(policy.metadata)}</TableCell>
                  <TableCell>{formatDate(policy.createdAt)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow noHover>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No policies yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </>
    ) : (
      <EmptyState
        title="No policies yet."
        description={policyDescription}
        link={`/${tenantId}/projects/${projectId}/policies/new`}
        linkText="Create policy"
      />
    );

    return <BodyTemplate breadcrumbs={['Policies']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="policies" />;
  }
}

export default PoliciesPage;
