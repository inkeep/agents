import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
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

export const dynamic = 'force-dynamic';

const colClass = 'w-1/7 align-top whitespace-pre-wrap';

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

    const content = data.length ? (
      <>
        <PageHeader
          title="Policies"
          description={description}
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
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
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
                <TableCell className={colClass}>{policy.name}</TableCell>
                <TableCell className={colClass}>{policy.id}</TableCell>
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
                <TableCell className={colClass}>{formatDate(policy.createdAt)}</TableCell>
                <TableCell className={colClass}>{formatDateAgo(policy.updatedAt)}</TableCell>
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
      <EmptyState
        title="No policies yet."
        description={description}
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
