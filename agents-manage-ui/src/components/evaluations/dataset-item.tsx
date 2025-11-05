import Link from 'next/link';
import { formatDate } from '@/app/utils/format-date';
import type { Dataset } from '@/lib/api/evaluations-client';
import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '../ui/item-card';

interface DatasetItemProps extends Dataset {
  tenantId: string;
}

export function DatasetItem({ id, name, description, createdAt, tenantId }: DatasetItemProps) {
  const href = `/${tenantId}/evaluations/datasets/${id}`;

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
          <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
        </ItemCardContent>
      </ItemCardLink>
    </ItemCardRoot>
  );
}
