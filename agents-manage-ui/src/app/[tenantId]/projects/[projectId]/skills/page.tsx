import { Plus } from 'lucide-react';
import NextLink from 'next/link';
import type { FC } from 'react';
import { formatDate, formatDateAgo } from '@/app/utils/format-date';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { fetchSkills } from '@/lib/api/skills';
import { cn } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';

const colClass = 'align-top whitespace-pre-wrap';
const description = (
  <>
    Agent Skills are reusable instruction blocks that can be attached to multiple sub-agents and
    ordered for priority.
    <ExternalLink href={`${DOCS_BASE_URL}/visual-builder/skills`}>Learn more</ExternalLink>
  </>
);

const SkillsPage: FC<PageProps<'/[tenantId]/projects/[projectId]/skills'>> = async ({ params }) => {
  const { tenantId, projectId } = await params;

  try {
    const { data } = await fetchSkills(tenantId, projectId);
    const action = (
      <Button asChild className="flex items-center gap-2">
        <NextLink href={`/${tenantId}/projects/${projectId}/skills/new`}>
          <Plus />
          Create skill
        </NextLink>
      </Button>
    );

    const content = data.length ? (
      <>
        <PageHeader title="Skills" description={description} action={action} />
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((skill) => (
              <TableRow key={skill.id} className="relative">
                <TableCell className="align-top">
                  <NextLink
                    // <tr> cannot contain a nested <a>.
                    href={`/${tenantId}/projects/${projectId}/skills/${skill.id}`}
                    className="absolute inset-0"
                  />
                  <Badge variant="code">{skill.name}</Badge>
                </TableCell>
                <TableCell className={colClass}>{skill.description}</TableCell>
                <TableCell className={colClass}>
                  <Badge variant="code" className={cn('line-clamp-3 whitespace-normal')}>
                    {skill.content}
                  </Badge>
                </TableCell>
                <TableCell className={colClass}>
                  <Badge variant="code" className={cn('line-clamp-3 whitespace-normal')}>
                    {JSON.stringify(skill.metadata)}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">{formatDate(skill.createdAt)}</TableCell>
                <TableCell className="align-top">{formatDateAgo(skill.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    ) : (
      <EmptyState title="No skills yet." description={description} action={action} />
    );

    return <BodyTemplate breadcrumbs={['Skills']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsPage;
