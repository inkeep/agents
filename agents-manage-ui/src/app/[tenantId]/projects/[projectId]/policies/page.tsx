import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { fetchPolicies } from '@/lib/api/policies';
import { getErrorCode } from '@/lib/utils/error-serialization';
import NextLink from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatDateAgo } from '@/app/utils/format-date';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExternalLink } from '@/components/ui/external-link';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { CreatePolicyModal } from '@/components/policies/create-policy-modal';

export const dynamic = 'force-dynamic';

const colClass = 'align-top whitespace-pre-wrap';
const description = (
  <>
    Policies are reusable instruction blocks that can be attached to multiple sub-agents and ordered
    for priority.
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/agent`}>Learn more</ExternalLink>
  </>
);

async function PoliciesPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/policies'>) {
  const { tenantId, projectId } = await params;

  try {
    const { data } = await fetchPolicies(tenantId, projectId);
    const action = <CreatePolicyModal />;

    const content = data.length ? (
      <>
        <PageHeader title="Policies" description={description} action={action} />
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((policy) => (
              <TableRow key={policy.id} className="relative">
                <TableCell className="align-top">
                  <Badge variant="code">{policy.id}</Badge>
                </TableCell>
                <TableCell className={colClass}>{policy.name}</TableCell>
                <TableCell className={colClass}>{policy.description}</TableCell>
                <TableCell className={colClass}>
                  <Badge variant="code" className={cn('line-clamp-3 whitespace-normal')}>
                    {policy.content}
                  </Badge>
                </TableCell>
                <TableCell className={colClass}>
                  <Badge variant="code" className={cn('line-clamp-3 whitespace-normal')}>
                    {JSON.stringify(policy.metadata)}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">{formatDate(policy.createdAt)}</TableCell>
                <TableCell className="align-top">{formatDateAgo(policy.updatedAt)}</TableCell>
                <NextLink
                  href={`/${tenantId}/projects/${projectId}/policies/${policy.id}`}
                  className="absolute inset-0"
                />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    ) : (
      <EmptyState title="No policies yet." description={description} action={action} />
    );

    return <BodyTemplate breadcrumbs={['Policies']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="policies" />;
  }
}

export default PoliciesPage;
