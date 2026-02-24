import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import type { FC } from 'react';
import FullPageError from '@/components/errors/full-page-error';
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
import { DOCS_BASE_URL, STATIC_LABELS } from '@/constants/theme';
import { fetchSkills } from '@/lib/api/skills';
import { cn } from '@/lib/utils';
import { getErrorCode } from '@/lib/utils/error-serialization';
import { formatDateAgo } from '@/lib/utils/format-date';

const colClass = 'align-top whitespace-pre-wrap';

export const metadata = {
  title: STATIC_LABELS.skills,
  description:
    'Agent Skills are reusable instruction blocks that can be attached to multiple sub-agents and ordered for priority.',
} satisfies Metadata;

const description = (
  <>
    {metadata.description}
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

    return data.length ? (
      <>
        <PageHeader title={metadata.title} description={description} action={action} />
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow noHover>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((skill) => (
                <TableRow key={skill.id} className="relative">
                  <TableCell className="align-top">
                    <NextLink
                      // <tr> cannot contain a nested <a>.
                      href={`/${tenantId}/projects/${projectId}/skills/${skill.id}/edit`}
                      className="absolute inset-0"
                    />
                    {skill.name}
                  </TableCell>
                  <TableCell className={colClass}>
                    <div className="h-14 line-clamp-3">{skill.description}</div>
                  </TableCell>
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
                  <TableCell className="align-top">{formatDateAgo(skill.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    ) : (
      <EmptyState title="No skills yet." description={description} action={action} />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="skills" />;
  }
};

export default SkillsPage;
