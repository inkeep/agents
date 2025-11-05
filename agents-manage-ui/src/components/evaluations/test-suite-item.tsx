import Link from 'next/link';
import { formatDate } from '@/app/utils/format-date';
import type { EvalTestSuiteConfig } from '@/lib/api/evaluations-client';
import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '../ui/item-card';

interface TestSuiteItemProps extends EvalTestSuiteConfig {
  tenantId: string;
}

export function TestSuiteItem({
  id,
  name,
  description,
  runFrequency,
  createdAt,
  tenantId,
}: TestSuiteItemProps) {
  const href = `/${tenantId}/evaluations/test-suites/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardLink href={href}>
        <ItemCardHeader>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardHeader>
      </ItemCardLink>
      <ItemCardLink href={href} className="group flex h-full">
        <ItemCardContent>
          <ItemCardDescription hasContent={!!description} className="line-clamp-2">
            {description || 'No description'}
          </ItemCardDescription>
          <ItemCardFooter footerText={`Runs ${runFrequency} • Created ${formatDate(createdAt)}`} />
        </ItemCardContent>
      </ItemCardLink>
    </ItemCardRoot>
  );
}
