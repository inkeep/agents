import Link from 'next/link';
import { formatDate } from '@/app/utils/format-date';
import type { Evaluator } from '@/lib/api/evaluations-client';
import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '../ui/item-card';

interface EvaluatorItemProps extends Evaluator {
  tenantId: string;
}

export function EvaluatorItem({ id, name, description, createdAt, tenantId }: EvaluatorItemProps) {
  const href = `/${tenantId}/evaluations/evaluators/${id}`;

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
